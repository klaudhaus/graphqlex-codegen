import { PluginFunction, Types } from "@graphql-codegen/plugin-helpers"
import { concatAST, FragmentDefinitionNode, GraphQLSchema, Kind, OperationDefinitionNode, visit, print } from "graphql"
import { ClientSideBaseVisitor, LoadedFragment } from "@graphql-codegen/visitor-plugin-common"
import dedent from "ts-dedent"

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

  const importsBlock = dedent`
    import { Api, gql } from "graphqlex"
    import {
      ${visitor.typeImports.sort().join(",\n")}
    } from "./graphql-types"
    
  `

  const setApiBlock = dedent`
    export let api: Api
    export function setApi (toApi: Api) { api = toApi }
    
  `

  return {
    content: [
      importsBlock,
      setApiBlock,
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

    if (node.operation === "query" || node.operation === "mutation") {
      documentString = dedent`
        export async function ${functionName} (vars: ${operationVariablesType}) {
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
