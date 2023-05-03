import { DocumentNode, FragmentDefinitionNode, Kind, SelectionSetNode } from "graphql"

/**
 * An operating context is based on the schema and operation document(s)
 * related to a particular API
 * that are defined within a GraphQL client environment, such as a front-end application.
 */
export type OperatingContext = {
  /**
   * One or more schema documents.
   */
  schemaDocs: DocumentNode[]

  /**
   * One or more operation documents.
   */
  operationDocs: DocumentNode[]
}

/**
 * Return a list of referenced fragment names for the given node,
 * which can be an operation definition node, a field node or a fragment node -
 * all of which have a selectionSet property.
 *
 * Using allAst as placeholder for further implementation of context-based meta-process.
 */
export const getNodeFragmentNames = ({ selectionSet }: { selectionSet?: SelectionSetNode }) => (allAst: DocumentNode) => {
  const result: string[] = []
  let definition: { selectionSet?: SelectionSetNode }
  for (const selection of selectionSet?.selections || []) {
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      result.push(selection.name.value)
      definition = allAst.definitions
        .filter(d =>
          d.kind === Kind.FRAGMENT_DEFINITION && d.name.value === selection.name.value
        )?.[0] as FragmentDefinitionNode
    } else { // Must be a field or inline fragment
      definition = selection
    }
    const innerFragments = getNodeFragmentNames(definition)(allAst)
    innerFragments.forEach(f => result.push(f))
  }
  return result
}
