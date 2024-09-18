import { skipToken, useGetDatabaseQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

type TopDbAttribute =
  | "field_usage_filter_count"
  | "field_usage_breakout_count"
  | "field_usage_aggregation_count";

export const useTopDbFields = (
  query: Lib.Query,
  stageIndex: number,
  attribute: TopDbAttribute,
) => {
  const dbId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    dbId
      ? {
          id: dbId,
          include: "tables.fields",
        }
      : skipToken,
  );

  const fields =
    database?.tables?.flatMap(table => {
      const fields = table.fields ?? [];
      return fields.map(field => ({
        ...field,
        table,
      }));
    }) ?? [];

  const usedFields = fields.filter(field => field[attribute] > 0);
  const sortedFields = sortFields(usedFields, attribute);

  const columns = Lib.filterableColumns(query, stageIndex);
  const getColumn = (field: Field) => {
    return columns.find(column => {
      const columnInfo = Lib.displayInfo(query, stageIndex, column);

      return (
        columnInfo.table?.name === field.table?.name &&
        columnInfo.displayName === field.display_name
      );
    });
  };

  const topFields = sortedFields
    .map(field => ({
      ...field,
      column: getColumn(field),
    }))
    .filter(({ column }) => column != null);

  return topFields.slice(0, 2);
};

const sortFields = (fields: Field[], attribute: TopDbAttribute) => {
  return fields.sort((a, b) => {
    const aVal = a[attribute];
    const bVal = b[attribute];
    return bVal - aVal;
  });
};
