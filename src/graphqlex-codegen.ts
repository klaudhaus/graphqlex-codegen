import { oldVisit, PluginFunction, Types } from "@graphql-codegen/plugin-helpers"
import { concatAST, FragmentDefinitionNode, GraphQLSchema, Kind, OperationDefinitionNode, print } from "graphql"
import { ClientSideBaseVisitor, LoadedFragment } from "@graphql-codegen/visitor-plugin-common"
import { getInputTypeInfoMap } from "./input-type-info"
import {
  getImportsBlock,
  getInputTypeBlock,
  operationFunction,
  getTrimInputsBlock, OperationFunctionInfo,
  setApiBlock
} from "./output-content"
import { getVariableInfo } from "./variable-type-info"

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
  const visitorResult = oldVisit(allAst, { leave: visitor })

  const inputTypeInfoMap = getInputTypeInfoMap(schema)
  const importsBlock = getImportsBlock(visitor.typeImports)
  const inputTypeBlock = getInputTypeBlock(inputTypeInfoMap)
  const fragmentsBlock = visitor.fragments
    .replace(/;/mg, "")
    .concat("\n")

  return {
    content: [
      importsBlock,
      setApiBlock,
      inputTypeBlock,
      fragmentsBlock,
      ...visitorResult.definitions.filter((t: any) => typeof t === "string")
    ].join("\n")
  }
}

class GraphqlexVisitor extends ClientSideBaseVisitor {
  typeImports: string[] = []

  OperationDefinition (node: OperationDefinitionNode): string {
    const operationType = node.operation
    const isSubscription = operationType === "subscription"
    const operationName = node.name.value
    const functionName = operationName + capitalise(operationType)

    const varDefs = node.variableDefinitions
    let paramName: string
    let paramType: string
    let transformVars: string
    const operationParamType = capitalise(functionName) + "Variables"
    if (varDefs?.length === 1 && !isSubscription) {
      const varDef = varDefs[0]
      const varInfo = getVariableInfo(varDef)
      paramName = varInfo.name
      this.typeImports.push(paramType = varInfo.typeName)
      transformVars = `const vars = {} as ${operationParamType}`
    } else {
      paramName = "vars"
      paramType = operationParamType
    }

    const selections = node.selectionSet?.selections
    let resultType: string
    if (selections?.length === 1 && !isSubscription) {
      // this._schema.getTypeMap()
      resultType = "qwerty"
    } else {
      resultType = capitalise(functionName)
    }

    // Make block to trim inputs
    const trimInputsBlock = [
      transformVars,
      getTrimInputsBlock(node.variableDefinitions)
    ].filter(Boolean).join("\n")

    // Make GQL block
    const fragmentDocNames = this._transformFragments(this._extractFragments(node))
    const fragmentExprs = fragmentDocNames.map(n => `\${${n}}`)
    const operationBlock = print(node)
    const gqlBlock = [...fragmentExprs, operationBlock].filter(Boolean).join("\n")

    const info: OperationFunctionInfo = {
      operationType,
      operationName,
      functionName,
      paramName,
      paramType,
      resultType,
      trimInputsBlock,
      gqlBlock
    }

    this.typeImports.push(operationParamType, info.resultType)

    return operationFunction(info)
  }
}

const capitalise = (str: String) => str.slice(0, 1).toUpperCase() + str.slice(1)
