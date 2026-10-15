import { useEffect, useMemo, useState } from "react";

import { fieldApi } from "metabase/api";
import { useDispatch } from "metabase/redux";
import * as Lib from "metabase-lib";
import type { FieldId } from "metabase-types/api";

import type { ColumnValueOptions } from "./suggestions";

const MAX_COLUMNS = 12;

type ListColumn = {
  column: Lib.ColumnMetadata;
  fieldId: FieldId;
};

function getListColumns(query: Lib.Query, stageIndex: number): ListColumn[] {
  return Lib.filterableColumns(query, stageIndex)
    .filter(Lib.isStringOrStringLike)
    .flatMap((column) => {
      const { fieldId, hasFieldValues } = Lib.fieldValuesSearchInfo(
        query,
        column,
      );
      return hasFieldValues === "list" && fieldId != null
        ? [{ column, fieldId }]
        : [];
    })
    .slice(0, MAX_COLUMNS);
}

/**
 * Known values of the text columns that have a short list of them, so typing a value can
 * filter on its column. Empty while loading, and until `isEnabled`, so nothing loads before
 * someone starts typing.
 */
export function useColumnValues(
  query: Lib.Query,
  stageIndex: number,
  isEnabled: boolean,
): ColumnValueOptions[] {
  const dispatch = useDispatch();
  const listColumns = useMemo(
    () => getListColumns(query, stageIndex),
    [query, stageIndex],
  );
  const fieldIdsKey = isEnabled
    ? listColumns.map(({ fieldId }) => fieldId).join(",")
    : "";
  const [valuesByFieldId, setValuesByFieldId] = useState(
    () => new Map<FieldId, string[]>(),
  );

  useEffect(() => {
    const fieldIds = fieldIdsKey
      .split(",")
      .filter((id) => id.length > 0)
      .map(Number);
    const requests = fieldIds.map((fieldId) =>
      dispatch(fieldApi.endpoints.getFieldValues.initiate(fieldId)),
    );
    let isCancelled = false;

    Promise.allSettled(requests.map((request) => request.unwrap())).then(
      (results) => {
        if (isCancelled) {
          return;
        }
        const nextValues = new Map<FieldId, string[]>();
        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            nextValues.set(
              fieldIds[index],
              result.value.values.flatMap(([value]) =>
                typeof value === "string" ? [value] : [],
              ),
            );
          }
        });
        setValuesByFieldId(nextValues);
      },
    );

    return () => {
      isCancelled = true;
      requests.forEach((request) => request.unsubscribe());
    };
  }, [dispatch, fieldIdsKey]);

  return useMemo(
    () =>
      listColumns.flatMap(({ column, fieldId }) => {
        const values = valuesByFieldId.get(fieldId);
        return values ? [{ column, values }] : [];
      }),
    [listColumns, valuesByFieldId],
  );
}
