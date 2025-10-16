import { useCallback } from "react";
import { t } from "ttag";

import { useLazyGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import {
  getDataErrorMessage,
  is403Error,
} from "metabase/metadata/pages/DataModel/components/PreviewSection/utils";
import type {
  DatabaseId,
  DatasetData,
  DatasetQuery,
  RowValue,
  TableId,
} from "metabase-types/api";

import type { PythonTransformSourceDraft } from "../components/PythonTransformEditor";

export type JSONRow = Record<string, RowValue>;

export type SampleData = {
  alias: string;
  rows: JSONRow[];
};

export function useSampleData(source: PythonTransformSourceDraft) {
  const [fetchData, { isLoading }] = useLazyGetAdhocQueryQuery();

  const fetchSampleData = useCallback(async () => {
    const databaseId = source["source-database"];
    const promises = [];

    if (!databaseId) {
      throw new Error(t`No database selected`);
    }

    for (const alias in source["source-tables"]) {
      const tableId = source["source-tables"][alias];
      const promise = fetchData(getPreviewQuery(databaseId, tableId), true)
        .unwrap()
        .then((data) => {
          if (data.status === "failed") {
            throw new Error(getDataErrorMessage(data));
          }
          return formatData(alias, data.data);
        });
      promises.push(promise);
    }

    try {
      return await Promise.all(promises);
    } catch (error) {
      if (is403Error(error)) {
        throw new Error(t`Sorry, you don’t have permission to see that.`);
      }
      throw new Error(getErrorMessage(error));
    }
  }, [source, fetchData]);

  return { fetchSampleData, isRunning: isLoading };
}

function getPreviewQuery(
  databaseId: DatabaseId,
  tableId: TableId,
): DatasetQuery {
  return {
    type: "query",
    database: databaseId,
    query: {
      "source-table": tableId,
      limit: 50,
    },
  };
}

function formatData(alias: string, data: DatasetData): SampleData {
  const rows = data.rows.map((row: RowValue[]) =>
    Object.fromEntries(
      data.cols.map((column, index) => [column.name, row[index]]),
    ),
  );

  return {
    alias,
    rows,
  };
}
