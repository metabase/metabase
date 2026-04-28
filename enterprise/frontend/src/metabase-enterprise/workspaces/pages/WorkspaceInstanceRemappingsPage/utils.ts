import type { Database, DatabaseId, TableRemapping } from "metabase-types/api";

export function filterRemappings(
  remappings: TableRemapping[],
  databasesById: Map<DatabaseId, Database>,
  query: string,
): TableRemapping[] {
  const trimmedQuery = query.trim().toLowerCase();
  if (trimmedQuery === "") {
    return remappings;
  }

  return remappings.filter((remapping) => {
    const databaseName = databasesById.get(remapping.database_id)?.name ?? "";
    const haystacks = [
      remapping.from_schema,
      remapping.from_table_name,
      remapping.to_schema,
      remapping.to_table_name,
      databaseName,
    ];
    return haystacks.some((value) =>
      value.toLowerCase().includes(trimmedQuery),
    );
  });
}
