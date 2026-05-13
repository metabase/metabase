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
  const databaseById = new Map<DatabaseId, Database>(
    databases.map((database) => [database.id, database]),
  );
  const remappingsByDatabaseId = new Map<DatabaseId, TableRemapping[]>();
  for (const remapping of remappings) {
    const list = remappingsByDatabaseId.get(remapping.database_id) ?? [];
    list.push(remapping);
    remappingsByDatabaseId.set(remapping.database_id, list);
  }

  return workspace.databases.reduce<DatabaseInfo[]>((result, entry) => {
    const database = databaseById.get(entry.id);
    if (database == null) {
      return result;
    }
    result.push({
      database,
      remappings: remappingsByDatabaseId.get(entry.id) ?? [],
    });
    return result;
  }, []);
}
