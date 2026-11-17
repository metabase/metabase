import cx from "classnames";
import { type ReactNode, useMemo } from "react";

import { formatValue } from "metabase/value-formatting";
import { getComputedSettingsForSeries } from "metabase/viz-core";
import type { DatasetColumn, RawSeries, RowValues } from "metabase-types/api";

import S from "./PreviewTable.module.css";

type PreviewTableProps = {
  rawSeries: RawSeries;
  cols: DatasetColumn[];
  rows: RowValues[];
  /** True when the first column is the primary key. */
  hasKey: boolean;
  /** The number of context columns, which come after the key. */
  contextCount?: number;
  /** Renders the values of the result column in place of the format of the column. */
  renderResult?: (value: RowValues[number]) => ReactNode;
};

/**
 * A plain table of the sample rows. The last column is the result of the
 * expression. The values have the same format as in a table question.
 */
export function PreviewTable({
  rawSeries,
  cols,
  rows,
  hasKey,
  contextCount = 0,
  renderResult,
}: PreviewTableProps) {
  const settings = useMemo(
    () => getComputedSettingsForSeries(rawSeries),
    [rawSeries],
  );
  const columns = useMemo(
    () =>
      cols.map((col) => {
        const columnSettings = settings.column?.(col) ?? { column: col };
        return {
          title: columnSettings._column_title_full || col.display_name,
          format: (value: RowValues[number]) =>
            value == null
              ? null
              : formatValue(value, {
                  ...columnSettings,
                  type: "cell",
                  jsx: true,
                  rich: true,
                  collapseNewlines: true,
                }),
        };
      }),
    [cols, settings],
  );
  const resultIndex = cols.length - 1;

  const contextStart = hasKey ? 1 : 0;
  const cellClassName = (index: number) =>
    cx(S.cell, {
      [S.key]: hasKey && index === 0,
      [S.context]: index >= contextStart && index < contextStart + contextCount,
      [S.result]: index === resultIndex,
    });

  return (
    <div className={S.container}>
      <table className={S.table}>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} className={cellClassName(index)}>
                <div className={S.value}>{column.title}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((value, index) => (
                <td key={index} className={cellClassName(index)}>
                  <div className={S.value}>
                    {renderResult != null && index === resultIndex
                      ? renderResult(value)
                      : columns[index].format(value)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
