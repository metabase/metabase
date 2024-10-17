import { useGetCardQueryMetadataQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Table } from "metabase-types/api";

export function useHiddenSourceTables(question: Question): Table[] {
  const query = question.query();
  const { isEditable, isNative } = Lib.queryDisplayInfo(query);

  const canHaveHiddenSourceTables = !isEditable && !isNative;

  const { data } = useGetCardQueryMetadataQuery(question.id(), {
    skip: !canHaveHiddenSourceTables,
  });

  if (!canHaveHiddenSourceTables) {
    return [];
  }

  return data?.tables.filter(table => table.visibility_type === "hidden") ?? [];
}
