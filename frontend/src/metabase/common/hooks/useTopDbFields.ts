import { skipToken, useGetDatabaseQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

type TopDbAttribute =
  | "field_usage_filter_count"
  | "field_usage_breakout_count"
  | "field_usage_aggregation_count";

export const useTopDbFields = (query: Lib.Query, attribute: TopDbAttribute) => {
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
      return table.fields ?? [];
    }) ?? [];

  const usedFields = fields.filter(field => field[attribute] > 0);

  const sortedFields = sortFields(usedFields, attribute);

  return sortedFields.slice(0, 2);
};

const sortFields = (fields: Field[], attribute: TopDbAttribute) => {
  return fields.sort((a, b) => {
    const aVal = a[attribute];
    const bVal = b[attribute];
    return bVal - aVal;
  });
};
