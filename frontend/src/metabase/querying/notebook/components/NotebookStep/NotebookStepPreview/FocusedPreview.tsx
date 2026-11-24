import cx from "classnames";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import CS from "metabase/css/core/index.css";
import { useQuestionFromOptsBuilder } from "metabase/metadata-store";
import { Box, Flex, Loader, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { NotebookStepType } from "../../../types";

import { PreviewTable } from "./PreviewTable";
import {
  type FocusedPreview as FocusedPreviewSpec,
  SHOWN_ROW_COUNT,
  getFocusedData,
  getFocusedPreview,
  sampleRows,
} from "./focused-preview";

type FocusedPreviewProps = {
  /** The step's query. Null shows the fallback. */
  query: Lib.Query | null;
  stageIndex: number;
  type: NotebookStepType;
  /** Master's preview, for a step that can't have a focused one. */
  fallback: ReactNode;
};

/**
 * The preview of all the clauses of a step, in the cells of the data grid:
 * the columns that the clauses use, then their results.
 */
export function FocusedPreview({
  query,
  stageIndex,
  type,
  fallback,
}: FocusedPreviewProps) {
  // The spec of a summary needs the labels of its aggregations, which are
  // async. Undefined while it loads, null when there is none.
  const [spec, setSpec] = useState<{
    query: Lib.Query;
    preview: FocusedPreviewSpec | null;
  }>();
  useEffect(() => {
    if (query == null) {
      return;
    }
    let isCancelled = false;
    getFocusedPreview(query, stageIndex, type).then((preview) => {
      if (!isCancelled) {
        setSpec({ query, preview });
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [query, stageIndex, type]);
  const preview = spec?.query === query ? spec.preview : undefined;

  const queries = useMemo(() => preview?.queries ?? [], [preview]);
  const first = useGetAdhocQueryQuery(
    queries[0] != null ? Lib.toJsQuery(queries[0]) : skipToken,
  );
  const second = useGetAdhocQueryQuery(
    queries[1] != null ? Lib.toJsQuery(queries[1]) : skipToken,
  );

  const buildQuestion = useQuestionFromOptsBuilder();
  const table = useMemo(() => {
    if (
      preview == null ||
      first.data?.data == null ||
      (queries[1] != null && second.data?.data == null)
    ) {
      return null;
    }
    const { cols } = first.data.data;
    // Filters sample the rows that they keep and the rows that they remove
    // apart, so that both show.
    const parts = [first.data.data.rows, second.data?.data?.rows]
      .slice(0, queries.length)
      .map((rows) => getFocusedData(cols, rows ?? [], preview));
    const countPerPart = Math.ceil(SHOWN_ROW_COUNT / parts.length);
    const focused = {
      ...parts[0],
      rows: parts.flatMap(({ rows, resultStart }) =>
        preview.isSampled ? sampleRows(rows, resultStart, countPerPart) : rows,
      ),
    };
    // The rows as a series, for the column settings of a table question.
    const card = buildQuestion({ dataset_query: Lib.toJsQuery(queries[0]) })
      .setDisplay("table")
      .setSettings({ "table.pivot": false })
      .card();
    const data = {
      ...first.data.data,
      cols: focused.cols,
      rows: focused.rows,
      results_metadata: { columns: focused.cols },
    };
    return {
      ...focused,
      isFilter: preview.isFilter,
      rawSeries: [{ card, data }],
    };
  }, [preview, queries, first.data, second.data, buildQuestion]);

  // While a new run loads, the rows of the last run stay, faded, so that the
  // layout does not shift.
  const [lastTable, setLastTable] = useState<typeof table>(null);
  useEffect(() => {
    if (table != null) {
      setLastTable(table);
    }
  }, [table]);
  const shown = table ?? lastTable;

  if (query == null || preview === null) {
    return <>{fallback}</>;
  }

  const error =
    first.error ?? second.error ?? first.data?.error ?? second.data?.error;
  const errorMessage =
    error != null ? getErrorMessage(error, t`Could not fetch preview`) : null;

  return (
    <Box
      className={cx(CS.bordered, CS.shadowed, CS.rounded, CS.bgWhite)}
      style={{ overflow: "hidden" }}
      data-testid="focused-preview"
    >
      {errorMessage != null ? (
        <Text c="feedback-negative" fz="sm" px="md" py="sm">
          {errorMessage}
        </Text>
      ) : shown == null ? (
        <Flex align="center" justify="center" p="xl">
          <Loader size="xl" />
        </Flex>
      ) : shown.rows.length === 0 ? (
        <Text c="text-secondary" fz="sm" px="md" py="sm">
          {t`No rows`}
        </Text>
      ) : (
        <Box style={{ opacity: table == null ? 0.5 : undefined }}>
          <PreviewTable
            rawSeries={shown.rawSeries}
            cols={shown.cols}
            rows={shown.rows}
            resultStart={shown.resultStart}
            totalIndex={shown.totalIndex}
            isFilter={shown.isFilter}
          />
        </Box>
      )}
    </Box>
  );
}
