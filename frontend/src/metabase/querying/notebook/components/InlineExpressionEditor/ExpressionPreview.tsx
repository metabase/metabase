import cx from "classnames";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useQuestionFromOptsBuilder } from "metabase/metadata-store";
import { formatExpressionParts } from "metabase/querying/expressions";
import { Flex, Icon, Loader, Text } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { AGGREGATION_FUNCTIONS, EXPRESSION_FUNCTIONS } from "metabase-lib";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import S from "./ExpressionPreview.module.css";
import { PreviewTable } from "./PreviewTable";

// Rows to run the expression on, and rows to show from them.
const QUERY_ROW_COUNT = 200;
const SHOWN_ROW_COUNT = 6;

type ExpressionPreviewProps = {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  /** The index of the edited custom column, or undefined for a new one. */
  expressionIndex?: number;
  clause: Lib.ExpressionClause;
  /** The name of the result column. An aggregation without a name keeps its own. */
  name?: string;
  /** A new value runs the expression again and picks new rows. */
  refreshKey: number;
  /** True when the text in the editor is not the expression in the preview. */
  isOutdated: boolean;
};

/**
 * Sample rows with the result of the expression, and only the columns that the
 * expression uses. A filter shows rows that it keeps and rows that it removes.
 * An aggregation shows its result for the groups of the breakouts. It runs
 * only on request.
 */
export function ExpressionPreview({
  query,
  stageIndex,
  expressionMode,
  expressionIndex,
  clause,
  name,
  refreshKey,
  isOutdated,
}: ExpressionPreviewProps) {
  // The query is built only for a run. Each valid edit saves the expression,
  // which changes `query`, and a new build of the same query has new ids, so
  // it would run again.
  const latestRef = useRef({
    query,
    stageIndex,
    expressionMode,
    expressionIndex,
    name,
  });
  latestRef.current = {
    query,
    stageIndex,
    expressionMode,
    expressionIndex,
    name,
  };
  // The aggregations inside an aggregation expression, as their source text.
  // A preview shows each of them as a column of its own.
  const [aggregationParts, setAggregationParts] = useState<AggregationPart[]>();
  useEffect(() => {
    if (expressionMode !== "aggregation") {
      return;
    }
    let isCancelled = false;
    const { query, stageIndex } = latestRef.current;
    getAggregationParts(query, stageIndex, clause).then((parts) => {
      if (!isCancelled) {
        setAggregationParts(parts);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [expressionMode, clause]);

  const preview = useMemo(() => {
    const { query, stageIndex, expressionMode, expressionIndex, name } =
      latestRef.current;
    if (expressionMode === "aggregation" && aggregationParts == null) {
      return null;
    }
    const preview =
      expressionMode === "aggregation"
        ? getAggregationPreviewQuery(
            query,
            stageIndex,
            clause,
            name,
            aggregationParts ?? [],
          )
        : getPreviewQuery(
            query,
            stageIndex,
            expressionMode === "filter" ? undefined : expressionIndex,
            clause,
            name ?? "",
          );
    return preview && { ...preview, name };
    // `name` is in the dependencies only to run again with a new name.
  }, [clause, name, aggregationParts]);
  const queries = useMemo(
    () =>
      preview == null
        ? []
        : expressionMode === "filter"
          ? splitByFilter(preview.query, stageIndex, preview.name ?? "")
          : [preview.query],
    // The mode and the stage do not change while the editor is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview],
  );
  const first = useGetAdhocQueryQuery(
    queries[0] != null ? Lib.toJsQuery(queries[0]) : skipToken,
  );
  const second = useGetAdhocQueryQuery(
    queries[1] != null ? Lib.toJsQuery(queries[1]) : skipToken,
  );
  const isFetching = first.isFetching || second.isFetching;
  const error = first.error ?? second.error;
  const refetch = () => {
    first.refetch();
    if (queries[1] != null) {
      second.refetch();
    }
  };
  const data = useMemo(() => {
    if (first.data == null || (queries[1] != null && second.data == null)) {
      return undefined;
    }
    if (second.data == null || queries[1] == null) {
      return first.data;
    }
    const error = first.data.error ?? second.data.error;
    return {
      ...first.data,
      error,
      data: first.data.data && {
        ...first.data.data,
        rows: [...first.data.data.rows, ...(second.data.data?.rows ?? [])],
      },
    };
  }, [first.data, second.data, queries]);
  const [seed, setSeed] = useState(0);

  const clauseRef = useRef(clause);
  const isFirstRefreshRef = useRef(true);
  useEffect(() => {
    if (isFirstRefreshRef.current) {
      isFirstRefreshRef.current = false;
      return;
    }
    // A new clause runs a new query by itself. The same one runs again.
    if (clause === clauseRef.current) {
      refetch();
    }
    clauseRef.current = clause;
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
            preview.name ?? null,
            preview.usedNames,
            preview.primaryKeyName,
          )
        : null,
    // `seed` picks other rows on request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, preview, seed],
  );

  // The sample as a series, for the column settings of a table question.
  const buildQuestion = useQuestionFromOptsBuilder();
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
    const card = buildQuestion({
      dataset_query: Lib.toJsQuery(preview.query),
    })
      .setDisplay("table")
      .setSettings({ "table.pivot": false })
      .card();
    return { rawSeries: [{ card, data: sampleData }] };
  }, [data, sample, preview, buildQuestion]);

  const errorMessage =
    error != null || data?.error != null
      ? getErrorMessage(error ?? data?.error, t`Could not run the preview`)
      : null;

  return (
    <div
      className={cx(S.preview, { [S.outdated]: isOutdated && !isFetching })}
      data-testid="expression-preview"
    >
      <div className={S.body}>
        {errorMessage != null ? (
          <Text c="feedback-negative" fz="sm" className={S.message}>
            {errorMessage}
          </Text>
        ) : sample == null ? (
          <div className={S.message}>
            <Loader size="sm" />
          </div>
        ) : sample.rows.length === 0 ? (
          <Text c="text-secondary" fz="sm" className={S.message}>
            {t`No rows`}
          </Text>
        ) : (
          sampleSeries != null && (
            <PreviewTable
              rawSeries={sampleSeries.rawSeries}
              cols={sample.cols}
              rows={sample.rows}
              hasKey={sample.hasKey}
              renderResult={
                expressionMode === "filter" ? renderFilterResult : undefined
              }
            />
          )
        )}
      </div>
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

type AggregationPart = { parts: Lib.ExpressionParts; label: string };

const AGGREGATION_OPERATORS = new Set<string>(
  Object.keys(AGGREGATION_FUNCTIONS).filter(
    (name) => !(name in EXPRESSION_FUNCTIONS),
  ),
);

/**
 * The aggregations that the expression combines, like the two counts of
 * `CountIf(…) / Count()`. It is empty when the expression is one aggregation.
 */
async function getAggregationParts(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.ExpressionClause,
): Promise<AggregationPart[]> {
  const root = Lib.expressionParts(query, stageIndex, clause);
  const found: Lib.ExpressionParts[] = [];
  const visit = (node: Lib.ExpressionParts | Lib.ExpressionArg) => {
    if (!Lib.isExpressionParts(node)) {
      return;
    }
    if (AGGREGATION_OPERATORS.has(node.operator)) {
      found.push(node);
    } else {
      node.args.forEach(visit);
    }
  };
  visit(root);
  if (found.length === 0 || found[0] === root) {
    return [];
  }
  const labels = await Promise.all(
    found.map((parts) =>
      formatExpressionParts(parts, { query, stageIndex, printWidth: Infinity }),
    ),
  );
  // The same aggregation twice shows once.
  const unique = new Map<string, Lib.ExpressionParts>();
  found.forEach((parts, index) => {
    const label = labels[index].trim();
    if (!unique.has(label)) {
      unique.set(label, parts);
    }
  });
  return [...unique].map(([label, parts]) => ({ label, parts }));
}

/**
 * The query up to the breakouts with the aggregation as its only aggregation,
 * after the aggregations that it combines. The groups of the breakouts come
 * first.
 */
function getAggregationPreviewQuery(
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.ExpressionClause,
  name: string | undefined,
  aggregationParts: AggregationPart[],
) {
  const base = Lib.previewQuery(query, stageIndex, "breakout", null);
  if (base == null) {
    return null;
  }
  const withParts = aggregationParts.reduce(
    (query, { parts, label }) =>
      Lib.aggregate(
        query,
        stageIndex,
        Lib.withExpressionName(Lib.expressionClause(parts), label),
      ),
    base,
  );
  const aggregation =
    name != null ? Lib.withExpressionName(clause, name) : clause;
  return {
    query: Lib.limit(
      Lib.aggregate(withParts, stageIndex, aggregation),
      stageIndex,
      QUERY_ROW_COUNT,
    ),
    usedNames: null,
    primaryKeyName: null,
  };
}

/**
 * The rows that the filter keeps, and the rows that it removes, as two
 * queries. A rare match would not show in one sample of the table.
 */
function splitByFilter(query: Lib.Query, stageIndex: number, name: string) {
  const column = Lib.filterableColumns(query, stageIndex).find(
    (column) =>
      Lib.displayInfo(query, stageIndex, column).displayName === name &&
      Lib.isBoolean(column),
  );
  if (column == null) {
    return [query];
  }
  const half = Math.ceil(QUERY_ROW_COUNT / 2);
  const kept = Lib.expressionClause("=", [column, true]);
  const removed = Lib.expressionClause("or", [
    Lib.expressionClause("=", [column, false]),
    Lib.expressionClause("is-null", [column]),
  ]);
  return [kept, removed].map((filter) =>
    Lib.limit(Lib.filter(query, stageIndex, filter), stageIndex, half),
  );
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
  name: string | null,
  /** Null shows all the columns. */
  usedNames: Set<string> | null,
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
          (usedNames == null || usedNames.has(cols[index].display_name)),
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
    hasKey: keyIndex >= 0,
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

function renderFilterResult(value: RowValue) {
  const isMatch = value === true;
  return (
    <Flex align="center" gap="xs">
      <Icon name={isMatch ? "check" : "close"} size={12} c="text-disabled" />
      {isMatch ? t`Matches` : t`Excluded`}
    </Flex>
  );
}

function isNumberOrNull(value: RowValue) {
  return value == null || typeof value === "number";
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}
