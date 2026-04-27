import type {
  ConcreteTableId,
  Table,
  TableDependencyNode,
} from "metabase-types/api";

export function toTableDependencyNode(table: Table): TableDependencyNode {
  return {
    id: table.id as ConcreteTableId,
    type: "table",
    data: {
      name: table.name,
      display_name: table.display_name,
      description: table.description,
      db_id: table.db_id,
      schema: table.schema,
      db: table.db,
      fields: table.fields,
      transform: table.transform,
      owner: table.owner,
    },
  };
}
