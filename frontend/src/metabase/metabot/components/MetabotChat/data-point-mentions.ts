import { t } from "ttag";

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

let nextDataPointMentionId = 1;

export const getNextDataPointMentionId = () => nextDataPointMentionId++;

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
  mentionId: number,
) => {
  const label = selectedData.label || t`data point`;
  return `[${label}](metabase://data-point/${mentionId})`;
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
  mentionId: number,
) => {
  const label = selectedRange.label || t`selected cells`;
  return `[${label}](metabase://data-point/${mentionId})`;
};

export const getDataPointMentionEventId = (event: Event) =>
  (event as CustomEvent<{ id: number }>).detail?.id;
