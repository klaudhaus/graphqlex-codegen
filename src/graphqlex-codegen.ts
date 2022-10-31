import { PluginFunction, Types } from "@graphql-codegen/plugin-helpers"
import {
  concatAST,
  FragmentDefinitionNode,
  GraphQLSchema,
  Kind,
  OperationDefinitionNode,
  visit,
  print,
  GraphQLInputObjectType, GraphQLScalarType, GraphQLInputType, GraphQLEnumType, GraphQLNonNull, GraphQLList
} from "graphql"
import { ClientSideBaseVisitor, LoadedFragment } from "@graphql-codegen/visitor-plugin-common"
import dedent from "ts-dedent"
import { InputFieldInfo, InputTypeInfoMap } from "graphqlex"

export const plugin: PluginFunction = (schema: GraphQLSchema, documents: Types.DocumentFile[], config: any) => {
  const allAst = concatAST(documents.map(v => v.document))
  const allFragments: LoadedFragment[] = [
    ...(allAst.definitions.filter(
      d => d.kind === Kind.FRAGMENT_DEFINITION
    ) as FragmentDefinitionNode[]).map(fragmentDef => ({
      node: fragmentDef,
      name: fragmentDef.name.value,
      onType: fragmentDef.typeCondition.name.value,
      isExternal: false
    }))
  ]
  const visitor = new GraphqlexVisitor(schema, allFragments, { ...config, dedupeFragments: true }, {})
  const visitorResult = visit(allAst, { leave: visitor })

  const inputTypeInfoMap = getInputTypeInfoMap(schema)

  const importsBlock = dedent`
    import { Api, gql, trimInput } from "graphqlex"
    import {
      ${visitor.typeImports.sort().join(",\n")}
    } from "./graphql-types"
    
  `

  const setApiBlock = dedent`
    export let api: Api
    export function setApi (toApi: Api) { api = toApi }
    
    // TODO: Add recursive function to make a sanitised version of any input object
    
  `

  const inputTypeBlock = dedent`
    const inputTypeInfoMap = ${JSON.stringify(inputTypeInfoMap, null, 2)}
    
  `

  return {
    content: [
      importsBlock,
      setApiBlock,
      inputTypeBlock,
      ...visitorResult.definitions.filter((t: any) => typeof t === "string")
    ].join("\n")
  }
}

class GraphqlexVisitor extends ClientSideBaseVisitor {
  public get mainContent (): string {
    return "Main content"
  }

  typeImports: string[] = []

  OperationDefinition (node: OperationDefinitionNode): string {
    this._collectedOperations.push(node)
    const operationType = capitalise(node.operation)
    const functionName = node.name.value + operationType
    const operationTypeSuffix = this.getOperationSuffix(node, operationType)
    const operationResultType = this.convertName(node, {
      suffix: operationTypeSuffix + this._parsedConfig.operationResultSuffix
    })
    const operationVariablesType = this.convertName(node, {
      suffix: operationTypeSuffix + "Variables"
    })
    this.typeImports.push(operationResultType, operationVariablesType)

    let documentString = ""
    const fragmentDocNames = this._transformFragments(node)
    const fragments = this._fragments
      .filter(f => fragmentDocNames.includes(this.getFragmentVariableName(f.name)))
      .map(fragment => print(fragment.node))
    const operationBlock = print(node)
    const gqlBlock = [...fragments, operationBlock].join("\n")

    const varsBlock = node.variableDefinitions
      .map(varDef => {
        const varInfo = getVariableInfo(varDef)
        if (varInfo.isList) {
          return dedent`
            if (Array.isArray(vars.${varInfo.name})) {
              vars.${varInfo.name} = vars.${varInfo.name}.map(item => trimInput(item, "${varInfo.typeName}", inputTypeInfoMap))
            }
          `
        } else {
          return `vars.${varInfo.name} = trimInput(vars.${varInfo.name}, "${varInfo.typeName}", inputTypeInfoMap)`
        }
      })
      .join("\n")

    if (node.operation === "query" || node.operation === "mutation") {
      documentString = dedent`
        export async function ${functionName} (vars: ${operationVariablesType}) {
          ${varsBlock}
        
          const ${node.operation} = gql\`
            ${gqlBlock}
          \`
          return <${operationResultType}> await api.run(${node.operation}, vars)
        }

      `
    } else if (node.operation === "subscription") {
      documentString = dedent`
        export function ${functionName} (
          handler?: (data: ${operationResultType}) => any,
          vars: ${operationVariablesType} = {}
        ) {
          ${varsBlock}
          
          const subscription = gql\`
            ${gqlBlock}
          \`
          api.subscribe(subscription, vars).onData(handler)
        }
        
      `
    }

    return documentString
  }
}

const capitalise = (str: String) => str.slice(0, 1).toUpperCase() + str.slice(1)

const getInputTypeInfoMap = (schema: GraphQLSchema): InputTypeInfoMap => {
  const result: InputTypeInfoMap = {}

  const getInputFieldInfo = (
    name: string,
    schemaFieldType: GraphQLInputType,
    isList: boolean = false,
    isNonNull: boolean = false
  ): InputFieldInfo => {
    if (schemaFieldType instanceof GraphQLScalarType ||
      schemaFieldType instanceof GraphQLEnumType ||
      schemaFieldType instanceof GraphQLInputObjectType
    ) {
      return { name, typeName: schemaFieldType.name, isList, isNonNull }
    } else if (schemaFieldType instanceof GraphQLNonNull) {
      return getInputFieldInfo(name, schemaFieldType.ofType, isList, true)
    } else if (schemaFieldType instanceof GraphQLList) {
      return getInputFieldInfo(name, schemaFieldType.ofType, true, isNonNull)
    } else {
      throw new Error(`GraphQL Code Generation error - input field name ${name} has an unknown type`)
    }
  }

  const schemaTypeMap = schema.getTypeMap()
  for (const typeName in schemaTypeMap) {
    const schemaType = schemaTypeMap[typeName]
    if (schemaType instanceof GraphQLInputObjectType) {
      const name = schemaType.name
      const fields: InputFieldInfo[] = []
      const schemaFieldMap = schemaType.getFields()
      for (const fieldName in schemaFieldMap) {
        const schemaField = schemaFieldMap[fieldName]
        fields.push(getInputFieldInfo(schemaField.name, schemaField.type))
      }
      result[name] = { name, fields }
    }
  }
  return result
}

type VariableInfo = {
  name: string
  typeName: string
  isList: boolean
}

const getVariableInfo = (varDef: any, name: string = "", isList: boolean = false): VariableInfo => {
  if (varDef.kind === "VariableDefinition") {
    return getVariableInfo(varDef.type, varDef.variable?.name?.value, isList)
  } else if (varDef.kind === "ListType") {
    return getVariableInfo(varDef.type, name, true)
  } else if (varDef.kind === "NamedType") {
    return { name, typeName: varDef.name?.value, isList }
  } else {
    // Keep drilling down
    return getVariableInfo(varDef.type, name, isList)
  }
}
