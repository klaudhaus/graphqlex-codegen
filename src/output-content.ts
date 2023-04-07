import dedent from "ts-dedent"
import { InputTypeInfoMap } from "graphqlex"
import { VariableDefinitionNode } from "graphql/language"
import { getVariableInfo } from "./variable-type-info"
import { OperationTypeNode } from "graphql"

export const getImportsBlock = (typeImports: string[]) => dedent`
  /* eslint-disable */
  import { Api, ApiOptions, GraphQLResponse, gql, trimInput } from "graphqlex"
  import {
    ${typeImports.sort().join(",\n")}
  } from "./graphql-types"
  
`

export const setApiBlock = dedent`
  export let api: Api
  export function setApi (toApi: Api) { api = toApi }
  
  export function initApi (url: string, options?: ApiOptions) {
    api = new Api(url, options)
  }
  
`

export const getInputTypeBlock = (inputTypeInfoMap: InputTypeInfoMap) => dedent`
  const inputTypeInfoMap = ${JSON.stringify(inputTypeInfoMap, null, 2)}
  
`

export const getTrimInputsBlock = (vars: readonly VariableDefinitionNode[]) => vars
  .map(v => getVariableInfo(v))
  .map(varInfo => {
    if (varInfo.isList) {
      return dedent`
          if (Array.isArray(vars.${varInfo.name})) {
            vars.${varInfo.name} = vars.${varInfo.name}.map(item => trimInput(item, "${varInfo.typeName}", inputTypeInfoMap))
          }
        `
    } else {
      return `vars.${varInfo.name} = trimInput(${vars.length === 1 ? "" : "vars."}${varInfo.name}, "${varInfo.typeName}", inputTypeInfoMap)`
    }
  })
  .join("\n")

export const operationFunction = (info: OperationFunctionInfo): string => {
  const body = info.operationType === "subscription"
    ? subscriptionFunction(info)
    : queryMutationFunction(info)

  return body + "\n"
}

/**
 * Get the function for a single-execution operation
 */
export const queryMutationFunction = (info: OperationFunctionInfo): string => dedent`
  export async function ${info.functionName} (${info.paramName}: ${info.paramType} = {}) {
    ${info.trimInputsBlock}
    
    const ${info.operationType} = gql\`
      ${info.gqlBlock}
    \`
    const response = await api.run(${info.operationType}, vars)
    ${info.dataTransformBlock}
    return <GraphQLResponse<${info.resultType}>>response
  }

`

export const subscriptionFunction = (info: OperationFunctionInfo): string => dedent`
  export function ${info.functionName} (
      handler?: (data: ${info.resultType}) => any,
      ${info.paramName}: ${info.paramType} = {}
    ) {
      ${info.trimInputsBlock}
      
      const subscription = gql\`
        ${info.gqlBlock}
      \`
      api.subscribe(subscription, vars).onData(handler)
    }

`

/**
 * Elements of the generated function.
 */
export type OperationFunctionInfo = {
  operationType: OperationTypeNode
  operationName: string
  functionName: string
  paramName?: string
  paramType?: string
  resultType?: string
  trimInputsBlock?: string
  gqlBlock?: string
  dataTransformBlock?: string
}
