import type {
  CurrentWorkspace,
  Database,
  DatabaseId,
  TableRemapping,
} from "metabase-types/api";

export type DatabaseInfo = {
  database: Database;
  remappings: TableRemapping[];
};

export function getDatabasesInfo(
  workspace: CurrentWorkspace,
  databases: Database[],
  remappings: TableRemapping[],
): DatabaseInfo[] {
  const databaseById = new Map<DatabaseId, Database>(
    databases.map((database) => [database.id, database]),
  );

  const remappingsByDatabaseId = new Map<DatabaseId, TableRemapping[]>();
  for (const remapping of remappings) {
    const list = remappingsByDatabaseId.get(remapping.database_id) ?? [];
    list.push(remapping);
    remappingsByDatabaseId.set(remapping.database_id, list);
  }

  return Object.keys(workspace.databases).reduce<DatabaseInfo[]>(
    (result, key) => {
      const databaseId = Number(key);
      const database = databaseById.get(databaseId);
      if (database == null) {
        return result;
      }
      result.push({
        database,
        remappings: remappingsByDatabaseId.get(databaseId) ?? [],
      });
      return result;
    },
    [],
  );
}
