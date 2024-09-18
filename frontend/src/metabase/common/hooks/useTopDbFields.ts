import { skipToken, useGetDatabaseQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

type TopDbAttribute =
  | "field_usage_filter"
  | "field_usage_breakout"
  | "field_usage_aggregation";

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
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const fields =
    database?.tables?.flatMap(table => {
      const fields = table.fields ?? [];
      return fields.map(field => ({
        ...field,
        table,
      }));
    }) ?? [];

  const countAttribute = attribute + "_count";
  const usedFields = fields.filter(field => (field as any)[countAttribute] > 0);
  const sortedFields = sortFields(usedFields, countAttribute);

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

  const filters = Lib.filters(query, stageIndex);
  const topFields = sortedFields
    .map(field => ({
      ...field,
      column: getColumn(field),
      attribute,
    }))
    .filter(({ column }) => {
      if (!column) {
        return false;
      }

      return filters.every(filter => {
        const parts = Lib.filterParts(query, stageIndex, filter);

        if (!parts?.column) {
          return true;
        }

        return !Lib.isEqual(parts?.column, column);
      });
    });

  return topFields.slice(0, 2);
};

const sortFields = (fields: Field[], attribute: string) => {
  return fields.sort((a, b) => {
    const aVal = (a as any)[attribute];
    const bVal = (b as any)[attribute];
    return bVal - aVal;
  });
};
