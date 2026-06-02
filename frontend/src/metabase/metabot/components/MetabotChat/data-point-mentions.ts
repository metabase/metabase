import { t } from "ttag";

import { parseTimestamp } from "metabase/utils/time-dayjs";
import { uuid } from "metabase/utils/uuid";
import type { ClickObject } from "metabase-lib";
import type {
  Dataset,
  DatasetColumn,
  MetabotChartConfig,
  MetabotColumnInfo,
  RowValue,
} from "metabase-types/api";

export type SelectedChartData = NonNullable<
  MetabotChartConfig["selected_data"]
>;
export type SelectedChartRange = NonNullable<
  MetabotChartConfig["selected_range"]
>;

export type DataPointSource = {
  type?: string;
  id?: string;
  question_url?: string;
};

export type DataPointMentionTarget = {
  columns?: string[];
  row?: RowValue[];
  value_column_index?: number;
  // Where this data point came from. Lets the chat re-render the source question
  // on demand when the point's chart isn't currently mounted (e.g. it was run in
  // a silent tool call or in an earlier turn that's no longer on screen).
  source?: DataPointSource;
};

export type DataPointMentionId = string | number;

export type DataPointMentionEvent = {
  id?: DataPointMentionId;
  target?: DataPointMentionTarget;
};

export type DataSelection = {
  targets: DataPointMentionTarget[];
  label?: string;
  count?: number;
};

export type DataSelectionMentionEvent = {
  id?: string;
  targets?: DataPointMentionTarget[];
};

export const getDataPointTargetsFromState = (
  state: any,
): Record<string, DataPointMentionTarget | undefined> | undefined => {
  return state?.["data-points"] ?? state?.data_points;
};

export const getDataSelectionsFromState = (
  state: any,
): Record<string, DataSelection | undefined> | undefined => {
  return state?.["data-selections"] ?? state?.data_selections;
};

let nextDataPointRangeMentionId = 1;

export const getNextDataPointRangeMentionId = () =>
  nextDataPointRangeMentionId++;

const getColumnName = (column: DatasetColumn | undefined | null) => {
  return column?.display_name || column?.name || t`Value`;
};

const getMetabotColumnInfo = (column: DatasetColumn): MetabotColumnInfo => ({
  name: getColumnName(column),
  type: column.base_type as MetabotColumnInfo["type"],
});

const getColumnInfo = (
  column: DatasetColumn | undefined | null,
): SelectedChartData["column"] | undefined => {
  if (!column) {
    return undefined;
  }

  return getMetabotColumnInfo(column);
};

const formatClickValue = (value: RowValue | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value == null) {
    return t`empty`;
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat(undefined, {
      notation: Math.abs(value) >= 1000 ? "compact" : "standard",
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (typeof value === "string") {
    const dateParts = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateParts) {
      const [, year, month, day] = dateParts;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        year: "numeric",
      }).format(date);
    }

    return value;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

const getSelectedChartDataLabel = (selectedData: SelectedChartData) => {
  const dimensionLabels = selectedData.dimensions
    ?.map(({ value }) => formatClickValue(value))
    .filter(Boolean);
  const valueLabel = formatClickValue(selectedData.value);
  const rowLabels = selectedData.row?.values
    .map((value) => formatClickValue(value))
    .filter(Boolean)
    .slice(0, 3);
  const columnLabel = selectedData.column?.name;

  const labels = [...(dimensionLabels ?? []), valueLabel].filter(Boolean);
  if (labels.length > 0) {
    return labels.join(" · ");
  }

  if (columnLabel) {
    return columnLabel;
  }

  if (rowLabels && rowLabels.length > 0) {
    return rowLabels.join(" · ");
  }

  return t`data point`;
};

export const getSelectedChartData = (
  clicked: ClickObject | null,
): SelectedChartData | null => {
  if (!clicked) {
    return null;
  }

  const row = clicked.origin
    ? {
        columns: clicked.origin.cols.map(getMetabotColumnInfo),
        values: clicked.origin.row,
      }
    : undefined;
  const primaryData = clicked.data?.find(
    ({ col, value }) => col || value !== undefined,
  );

  const selectedData: SelectedChartData = {
    value: clicked.value ?? primaryData?.value,
    column: getColumnInfo(clicked.column ?? primaryData?.col),
    dimensions: clicked.dimensions?.map(({ column, value }) => ({
      column: getMetabotColumnInfo(column),
      value,
    })),
    row,
  };

  return {
    ...selectedData,
    label: getSelectedChartDataLabel(selectedData),
  };
};

export const getChartData = (
  result: Dataset | null,
): MetabotChartConfig["data"] => {
  if (!result?.data) {
    return undefined;
  }

  return [
    {
      columns: result.data.cols.map(getMetabotColumnInfo),
      rows: result.data.rows,
    },
  ];
};

export const getDataPointMentionMarkdown = (
  selectedData: SelectedChartData,
  mentionId: DataPointMentionId,
) => {
  const label = selectedData.label || t`data point`;
  return `[${label}](metabase://data-point/${mentionId})`;
};

export const getDataPointTargetFromSelectedData = (
  selectedData: SelectedChartData,
): DataPointMentionTarget | undefined => {
  const selectedRow = selectedData.row;
  const row = selectedRow?.values;
  if (!row) {
    return undefined;
  }

  const columns = selectedRow.columns.map((column) => column.name);
  const selectedColumnName = selectedData.column?.name;
  const selectedColumnIndex = selectedColumnName
    ? selectedRow.columns.findIndex(
        (column) => column.name === selectedColumnName,
      )
    : -1;

  return {
    columns,
    row,
    value_column_index:
      selectedColumnIndex >= 0 ? selectedColumnIndex : row.length - 1,
  };
};

const getTargetValueColumnIndex = (target: DataPointMentionTarget) => {
  return typeof target.value_column_index === "number"
    ? target.value_column_index
    : (target.row?.length ?? 1) - 1;
};

const normalizeTimestamp = (value: RowValue) => {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = parseTimestamp(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DDTHH:mm:ss") : null;
};

const isSameValue = (left: RowValue, right: RowValue) => {
  if (left === right || String(left) === String(right)) {
    return true;
  }

  const leftTimestamp = normalizeTimestamp(left);
  const rightTimestamp = normalizeTimestamp(right);

  return (
    leftTimestamp != null &&
    rightTimestamp != null &&
    leftTimestamp === rightTimestamp
  );
};

const isSameDataPointTarget = (
  left: DataPointMentionTarget,
  right: DataPointMentionTarget,
) => {
  const leftRow = left.row;
  const rightRow = right.row;

  return (
    leftRow != null &&
    rightRow != null &&
    leftRow.length === rightRow.length &&
    getTargetValueColumnIndex(left) === getTargetValueColumnIndex(right) &&
    leftRow.every((value, index) => isSameValue(value, rightRow[index]))
  );
};

const findDataPointMentionId = (
  target: DataPointMentionTarget | undefined,
  dataPointTargets: Record<string, DataPointMentionTarget | undefined> = {},
) => {
  if (!target) {
    return undefined;
  }

  return Object.entries(dataPointTargets).find(([, existingTarget]) =>
    existingTarget ? isSameDataPointTarget(existingTarget, target) : false,
  )?.[0];
};

export const getDataPointMention = (
  selectedData: SelectedChartData,
  dataPointTargets?: Record<string, DataPointMentionTarget | undefined>,
) => {
  const target = getDataPointTargetFromSelectedData(selectedData);
  const existingId = findDataPointMentionId(target, dataPointTargets);

  if (existingId) {
    return { id: existingId, target, isGenerated: false };
  }

  console.warn("point doens't exist, generating new uuid");
  return { id: uuid(), target, isGenerated: true };
};

const getSelectedChartRangeLabel = (
  range: Omit<SelectedChartRange, "label">,
) => {
  const columnNames = range.columns
    .map((column) => column.name)
    .filter(Boolean);
  const columnText = columnNames.slice(0, 2).join(" + ");
  const rowText =
    range.rows.length === 1 ? t`1 row` : t`${range.rows.length} rows`;
  const cellText =
    range.cell_count === 1 ? t`1 cell` : t`${range.cell_count} cells`;

  return columnText
    ? `${cellText} · ${rowText} · ${columnText}`
    : `${cellText} · ${rowText}`;
};

export const getSelectedChartRange = ({
  columns,
  rows,
  cellCount,
}: {
  columns: MetabotColumnInfo[];
  rows: RowValue[][];
  cellCount: number;
}): SelectedChartRange => {
  const range = {
    columns,
    rows,
    cell_count: cellCount,
  };

  return {
    ...range,
    label: getSelectedChartRangeLabel(range),
  };
};

export const getDataPointRangeMentionMarkdown = (
  selectedRange: SelectedChartRange,
  mentionId: DataPointMentionId,
) => {
  const label = selectedRange.label || t`selected cells`;
  return `[${label}](metabase://data-point/${mentionId})`;
};

const getColumnIndex = (
  columns: DatasetColumn[],
  target: DataPointMentionTarget,
) => {
  const targetIndex = target.value_column_index;
  if (typeof targetIndex === "number" && columns[targetIndex]) {
    return targetIndex;
  }

  return columns.length - 1;
};

const buildClickedObject = (
  cols: DatasetColumn[],
  matchingRow: RowValue[],
  valueColumnIndex: number,
): ClickObject => {
  const valueColumn = cols[valueColumnIndex];

  return {
    value: matchingRow[valueColumnIndex],
    column: valueColumn,
    dimensions: cols
      .map((column, index) => ({ column, value: matchingRow[index] }))
      .filter(
        ({ column, value }, index) =>
          index !== valueColumnIndex && (column || value !== undefined),
      ),
    origin: {
      cols,
      row: matchingRow,
    },
  };
};

export const getClickedObjectFromDataPointTarget = (
  result: Dataset | null,
  target: DataPointMentionTarget | undefined,
): ClickObject | null => {
  if (!result?.data || !target?.row) {
    return null;
  }

  const { cols, rows } = result.data;
  const targetRow = target.row;
  const matchingRow = rows.find(
    (row) =>
      row.length === targetRow.length &&
      row.every((value, index) => isSameValue(value, targetRow[index])),
  );

  if (!matchingRow) {
    return null;
  }

  return buildClickedObject(cols, matchingRow, getColumnIndex(cols, target));
};

export type FuzzyDataPointMatch = {
  clicked: ClickObject;
  // Number of columns that matched between the target and the result. The router
  // uses this to pick the best-fitting card when no card holds an exact match.
  score: number;
};

// A relaxed match used as a fallback when no rendered card holds the exact row.
// Instead of requiring the full row to match, it matches on the columns the
// target and the result share by name. Requires a UNIQUE matching row so we
// never highlight an arbitrary wrong row; returns the matched cell plus a score
// so the caller can prefer the card that shares the most columns.
export const getFuzzyClickedObjectFromDataPointTarget = (
  result: Dataset | null,
  target: DataPointMentionTarget | undefined,
): FuzzyDataPointMatch | null => {
  if (!result?.data || !target?.row || !target.columns) {
    return null;
  }

  const { cols, rows } = result.data;
  const targetRow = target.row;
  const targetColumns = target.columns;

  const shared = cols
    .map((col, resultIndex) => {
      const targetIndex = targetColumns.findIndex((name) => name === col.name);
      return targetIndex >= 0 ? { resultIndex, targetIndex } : null;
    })
    .filter((pair): pair is { resultIndex: number; targetIndex: number } =>
      Boolean(pair),
    );

  if (shared.length === 0) {
    return null;
  }

  const matches = rows.filter((row) =>
    shared.every(({ resultIndex, targetIndex }) =>
      isSameValue(row[resultIndex], targetRow[targetIndex]),
    ),
  );

  // Ambiguous (or no) match — bail rather than risk highlighting the wrong row.
  if (matches.length !== 1) {
    return null;
  }

  const matchingRow = matches[0];

  // Prefer the target's value column when it's one of the shared columns,
  // otherwise fall back to the last shared column.
  const sharedValue = shared.find(
    ({ targetIndex }) => targetIndex === target.value_column_index,
  );
  const valueColumnIndex = sharedValue
    ? sharedValue.resultIndex
    : shared[shared.length - 1].resultIndex;

  return {
    clicked: buildClickedObject(cols, matchingRow, valueColumnIndex),
    score: shared.length,
  };
};

export const getDataPointMentionEvent = (event: Event): DataPointMentionEvent =>
  (event as CustomEvent<DataPointMentionEvent>).detail ?? {};

export const getDataPointMentionEventId = (event: Event) =>
  getDataPointMentionEvent(event).id;

export const getClickedObjectsFromDataSelection = (
  result: Dataset | null,
  targets: DataPointMentionTarget[] | undefined,
): ClickObject[] => {
  if (!result?.data || !targets?.length) {
    return [];
  }

  return targets
    .map((target) => getClickedObjectFromDataPointTarget(result, target))
    .filter((clicked): clicked is ClickObject => clicked != null);
};

export const getDataSelectionMentionEvent = (
  event: Event,
): DataSelectionMentionEvent =>
  (event as CustomEvent<DataSelectionMentionEvent>).detail ?? {};
