import type {
  Database,
  DatabaseId,
  TableRemapping,
  WorkspaceInstance,
} from "metabase-types/api";

export type DatabaseInfo = {
  database: Database;
  remappings: TableRemapping[];
};

export function getDatabasesInfo(
  workspace: WorkspaceInstance,
  databases: Database[],
  remappings: TableRemapping[],
): DatabaseInfo[] {
  const databaseByName = new Map<string, Database>(
    databases.map((database) => [database.name, database]),
  );

  const remappingsByDatabaseId = new Map<DatabaseId, TableRemapping[]>();
  for (const remapping of remappings) {
    const list = remappingsByDatabaseId.get(remapping.database_id) ?? [];
    list.push(remapping);
    remappingsByDatabaseId.set(remapping.database_id, list);
  }

  return Object.keys(workspace.databases).reduce<DatabaseInfo[]>(
    (result, name) => {
      const database = databaseByName.get(name);
      if (database == null) {
        return result;
      }
      result.push({
        database,
        remappings: remappingsByDatabaseId.get(database.id) ?? [],
      });
      return result;
    },
    [],
  );
}
