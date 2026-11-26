import { Stack, Text, Title } from "metabase/ui";

import S from "./DbtExploration.module.css";
import type { ResultTable } from "./types";

const COLUMN_LABELS: Record<string, string> = {
  metric_time__month: "Month",
  month: "Month",
  customer__customer_name: "Customer",
  customer_name: "Customer",
  revenue: "Revenue",
  billable_hours: "Billable hours",
  revenue_per_billable_hour: "Revenue / hour",
};

const MONTH_COLUMNS = new Set(["metric_time__month", "month"]);

type ResultPanelProps = {
  title: string;
  caption: string;
  table: ResultTable;
};

/** A titled, bordered result table. */
export function ResultPanel({ title, caption, table }: ResultPanelProps) {
  return (
    <Stack gap="xs" className={S.panel}>
      <Title order={5}>{title}</Title>
      <Text size="sm" c="text-secondary">
        {caption}
      </Text>
      <ResultTableView table={table} />
    </Stack>
  );
}

/** A query result as a plain table, with numeric columns right-aligned. */
export function ResultTableView({ table }: { table: ResultTable }) {
  const numericColumns = table.columns.map(
    (column, columnIndex) =>
      !MONTH_COLUMNS.has(column) &&
      table.rows.every((row) => isNumber(row[columnIndex] ?? "")),
  );

  return (
    <div className={S.tableScroll}>
      <table className={S.table}>
        <thead>
          <tr>
            {table.columns.map((column, columnIndex) => (
              <th
                key={columnIndex}
                className={numericColumns[columnIndex] ? S.numeric : undefined}
              >
                {COLUMN_LABELS[column] ?? column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((value, columnIndex) => (
                <td
                  key={columnIndex}
                  className={
                    numericColumns[columnIndex] ? S.numeric : undefined
                  }
                >
                  {formatCell(table.columns[columnIndex], value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isNumber(value: string) {
  return value === "" || Number.isFinite(Number(value));
}

function formatCell(column: string | undefined, value: string) {
  if (value === "") {
    return "—";
  }
  if (column != null && MONTH_COLUMNS.has(column)) {
    return value.slice(0, 7);
  }
  if (isNumber(value)) {
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  }
  return value;
}
