import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { ActionIcon, Flex, Icon, Loader, Text, Tooltip } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import { VisualizationPreview } from "../NotebookStep/NotebookStepPreview";

import S from "./ExpressionPreview.module.css";

// Rows to run the expression on, and rows to show from them.
const QUERY_ROW_COUNT = 200;
const SHOWN_ROW_COUNT = 8;
const DEBOUNCE_MS = 600;

type ExpressionPreviewProps = {
  query: Lib.Query;
  stageIndex: number;
  /** The index of the edited custom column, or undefined for a new one. */
  expressionIndex?: number;
  clause: Lib.ExpressionClause;
  name: string;
  /** A new value runs the current expression at once and picks new rows. */
  refreshKey: number;
  onClose: () => void;
};

/**
 * Sample rows with the result of the expression, and only the columns that the
 * expression uses.
 */
export function ExpressionPreview({
  query,
  stageIndex,
  expressionIndex,
  clause,
  name,
  refreshKey,
  onClose,
}: ExpressionPreviewProps) {
  // The clause after a pause in typing, or at once on a refresh.
  const [debouncedClause, setDebouncedClause] = useState(clause);
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedClause(clause), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [clause]);
  const debouncedClauseRef = useRef(debouncedClause);
  debouncedClauseRef.current = debouncedClause;

  const preview = useMemo(
    () =>
      getPreviewQuery(
        query,
        stageIndex,
        expressionIndex,
        debouncedClause,
        name,
      ),
    [query, stageIndex, expressionIndex, debouncedClause, name],
  );
  const { data, error, isFetching, refetch } = useGetAdhocQueryQuery(
    preview ? Lib.toJsQuery(preview.query) : skipToken,
  );
  const [seed, setSeed] = useState(0);

  const latestClauseRef = useRef(clause);
  latestClauseRef.current = clause;
  const isFirstRefreshRef = useRef(true);
  useEffect(() => {
    if (isFirstRefreshRef.current) {
      isFirstRefreshRef.current = false;
      return;
    }
    const latestClause = latestClauseRef.current;
    setDebouncedClause(latestClause);
    // A new clause runs a new query by itself. The same one runs again.
    if (latestClause === debouncedClauseRef.current) {
      refetch();
    }
    setSeed((seed) => seed + 1);
    // Only a new refresh key refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const sample = useMemo(
    () =>
      data?.data && preview
        ? getSample(
            data.data.cols,
            data.data.rows,
            name,
            preview.usedNames,
            preview.primaryKeyName,
          )
        : null,
    // `seed` picks other rows on request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, name, preview, seed],
  );

  // The sample, as a result for the normal table visualization.
  const sampleSeries = useMemo(() => {
    if (data?.data == null || sample == null || preview == null) {
      return null;
    }
    const sampleData = {
      ...data.data,
      cols: sample.cols,
      rows: sample.rows,
      results_metadata: { columns: sample.cols },
    };
    const card = Question.create({
      dataset_query: Lib.toJsQuery(preview.query),
    })
      .setDisplay("table")
      .setSettings({ "table.pivot": false })
      .card();
    return {
      rawSeries: [{ card, data: sampleData }],
      result: { ...data, data: sampleData },
    };
  }, [data, sample, preview]);

  const errorMessage =
    error != null || data?.error != null
      ? getErrorMessage(error ?? data?.error, t`Could not run the preview`)
      : null;

  return (
    <div className={S.preview} data-testid="expression-preview">
      <Flex align="center" gap="xs" mb="sm">
        <Text fw="bold" fz="sm">
          {t`Preview`}
        </Text>
        {isFetching && <Loader size="xs" ml="xs" />}
        <Flex ml="auto" gap="xs">
          <Tooltip label={t`Show other rows`}>
            <ActionIcon
              aria-label={t`Show other rows`}
              onClick={() => setSeed((seed) => seed + 1)}
              disabled={sample == null}
            >
              <Icon name="refresh" />
            </ActionIcon>
          </Tooltip>
          <ActionIcon aria-label={t`Close preview`} onClick={onClose}>
            <Icon name="close" />
          </ActionIcon>
        </Flex>
      </Flex>
      {errorMessage != null ? (
        <Text c="feedback-negative" fz="sm">
          {errorMessage}
        </Text>
      ) : sample == null ? (
        <Loader size="sm" />
      ) : sample.rows.length === 0 ? (
        <Text c="text-secondary" fz="sm">{t`No rows`}</Text>
      ) : (
        <VisualizationPreview
          rawSeries={sampleSeries?.rawSeries ?? null}
          result={sampleSeries?.result ?? null}
          error={null}
        />
      )}
    </div>
  );
}

/**
 * The query up to the custom columns: the earlier custom columns stay, because
 * the expression can use them, and the steps after the custom columns go. It
 * returns only the columns that the expression uses, and the expression.
 */
function getPreviewQuery(
  query: Lib.Query,
  stageIndex: number,
  expressionIndex: number | undefined,
  clause: Lib.ExpressionClause,
  name: string,
) {
  const base =
    expressionIndex == null
      ? Lib.previewQuery(query, stageIndex, "expressions", null)
      : expressionIndex === 0
        ? Lib.previewQuery(query, stageIndex, "joins", null)
        : Lib.previewQuery(
            query,
            stageIndex,
            "expressions",
            expressionIndex - 1,
          );
  if (base == null) {
    return null;
  }
  let previewQuery = Lib.expression(base, stageIndex, name, clause);
  const used = getUsedColumns(previewQuery, stageIndex, clause);
  const usedNames = new Set(
    used.map(
      (column) =>
        Lib.displayInfo(previewQuery, stageIndex, column).longDisplayName,
    ),
  );

  // A column of a linked table (an implicit join) is not a field of the
  // stage, so a helper custom column with its name returns it. The columns of
  // explicit joins come back with their join.
  const expressionNames = new Set(
    Lib.expressions(previewQuery, stageIndex).map(
      (expression) =>
        Lib.displayInfo(previewQuery, stageIndex, expression).displayName,
    ),
  );
  for (const column of used) {
    const info = Lib.displayInfo(previewQuery, stageIndex, column);
    if (
      info.isImplicitlyJoinable &&
      !expressionNames.has(info.longDisplayName)
    ) {
      previewQuery = Lib.expression(
        previewQuery,
        stageIndex,
        info.longDisplayName,
        Lib.expressionClause(column),
      );
      expressionNames.add(info.longDisplayName);
    }
  }

  // The primary key of the source table, so that a row can be found again.
  const finalFieldable = Lib.fieldableColumns(previewQuery, stageIndex);
  const primaryKey = finalFieldable.find((column) => {
    const info = Lib.displayInfo(previewQuery, stageIndex, column);
    return (
      Lib.isPrimaryKey(column) && !info.isFromJoin && !info.isImplicitlyJoinable
    );
  });
  const primaryKeyName =
    primaryKey != null
      ? Lib.displayInfo(previewQuery, stageIndex, primaryKey).longDisplayName
      : null;

  // Custom columns always come back. Of the other columns, only the key and
  // the used ones.
  const fields = [
    ...new Set(
      [
        primaryKey,
        ...used.map((column) =>
          Lib.findMatchingColumn(
            previewQuery,
            stageIndex,
            column,
            finalFieldable,
          ),
        ),
      ].filter(isNotNull),
    ),
  ];
  if (fields.length > 0) {
    previewQuery = Lib.withFields(previewQuery, stageIndex, fields);
  }
  return {
    query: Lib.limit(previewQuery, stageIndex, QUERY_ROW_COUNT),
    usedNames,
    primaryKeyName,
  };
}

function getUsedColumns(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.ExpressionClause,
) {
  const columns: Lib.ColumnMetadata[] = [];
  const visit = (part: Lib.ExpressionParts | Lib.ExpressionArg) => {
    if (Lib.isColumnMetadata(part)) {
      columns.push(part);
    } else if (part != null && typeof part === "object" && "args" in part) {
      part.args.forEach(visit);
    }
  };
  visit(Lib.expressionParts(query, stageIndex, clause));
  return columns;
}

/**
 * Rows that show different results of the expression: every distinct result
 * when there are few, else values from the smallest to the largest number, or
 * random rows.
 */
function getSample(
  cols: DatasetColumn[],
  rows: RowValues[],
  name: string,
  usedNames: Set<string>,
  primaryKeyName: string | null,
) {
  const foundIndex = cols.findIndex((col) => col.display_name === name);
  const resultIndex = foundIndex >= 0 ? foundIndex : cols.length - 1;
  const keyIndex = cols.findIndex(
    (col, index) =>
      index !== resultIndex && col.display_name === primaryKeyName,
  );
  // The primary key, the used columns, then the result.
  const order = [
    ...(keyIndex >= 0 ? [keyIndex] : []),
    ...cols
      .map((_, index) => index)
      .filter(
        (index) =>
          index !== resultIndex &&
          index !== keyIndex &&
          usedNames.has(cols[index].display_name),
      ),
    resultIndex,
  ];
  const reorder = (row: RowValues) => order.map((index) => row[index]);

  const groups = new Map<string, RowValues[]>();
  for (const row of rows) {
    const key = JSON.stringify(row[resultIndex]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let picked: RowValues[];
  if (groups.size <= SHOWN_ROW_COUNT) {
    picked = pickRoundRobin([...groups.values()].map(shuffle));
  } else if (rows.every((row) => isNumberOrNull(row[resultIndex]))) {
    picked = pickSpread(rows, resultIndex);
  } else {
    picked = [...groups.values()]
      .map((group) => shuffle(group)[0])
      .sort(() => Math.random() - 0.5)
      .slice(0, SHOWN_ROW_COUNT);
  }

  return {
    cols: order.map((index) => cols[index]),
    rows: picked.map(reorder),
    resultIndex: order.length - 1,
  };
}

function pickRoundRobin(groups: RowValues[][]) {
  const picked: RowValues[] = [];
  for (let i = 0; picked.length < SHOWN_ROW_COUNT; i++) {
    const round = groups.map((group) => group[i]).filter(Boolean);
    if (round.length === 0) {
      break;
    }
    picked.push(...round);
  }
  return picked.slice(0, SHOWN_ROW_COUNT);
}

function pickSpread(rows: RowValues[], resultIndex: number) {
  const empty = rows.filter((row) => row[resultIndex] == null);
  const sorted = rows
    .filter((row) => row[resultIndex] != null)
    .sort((a, b) => Number(a[resultIndex]) - Number(b[resultIndex]));
  const count = SHOWN_ROW_COUNT - (empty.length > 0 ? 1 : 0);
  const step = (sorted.length - 1) / Math.max(count - 1, 1);
  const offset = Math.floor(Math.random() * Math.max(step, 1));
  const picked = Array.from(
    { length: Math.min(count, sorted.length) },
    (_, i) =>
      sorted[
        Math.min(
          Math.round(i * step) + (i === 0 ? 0 : offset),
          sorted.length - 1,
        )
      ],
  );
  return [...new Set([...picked, ...shuffle(empty).slice(0, 1)])];
}

function isNumberOrNull(value: RowValue) {
  return value == null || typeof value === "number";
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}
