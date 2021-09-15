import { PluginFunction, Types } from "@graphql-codegen/plugin-helpers"
import { concatAST, DocumentNode, FragmentDefinitionNode, GraphQLSchema, Kind, visit } from "graphql"
import { ClientSideBaseVisitor, LoadedFragment } from "@graphql-codegen/visitor-plugin-common"

export const plugin: PluginFunction = (schema: GraphQLSchema, documents: Types.DocumentFile[], config: any) => {
  const allAst = concatAST(documents.map(v => v.document as DocumentNode));
  const allFragments: LoadedFragment[] = [
    ...(allAst.definitions.filter(
      d => d.kind === Kind.FRAGMENT_DEFINITION
    ) as FragmentDefinitionNode[]).map(fragmentDef => ({
      node: fragmentDef,
      name: fragmentDef.name.value,
      onType: fragmentDef.typeCondition.name.value,
      isExternal: false,
    }))
  ];
  const visitor = new GraphqlexVisitor(schema, allFragments, config, {});
  const visitorResult = visit(allAst, { leave: visitor });

  return {
    prepend: visitor.getImports(),
    content: [
      visitor.fragments,
      ...visitorResult.definitions.filter((t: any) => typeof t === 'string'),
      visitor.mainContent,
    ].join('\n'),
  };
}

class GraphqlexVisitor extends ClientSideBaseVisitor {
  public get mainContent(): string {
    return "Main content"
  }
}

