import cx from "classnames";
import { type ReactNode, useMemo } from "react";

import {
  BodyCell,
  type CellAlign,
  HeaderCellPill,
  HeaderCellWrapper,
} from "metabase/data-grid";
import { formatValue } from "metabase/value-formatting";
import { getComputedSettingsForSeries } from "metabase/viz-core";
import { isFK, isPK } from "metabase-lib/v1/types/utils/isa";
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
 * A plain table of the sample rows, with the header and body cells of the
 * data grid. The last column is the result of the expression. The values have
 * the same format and alignment as in a table question, and keys show as
 * pills.
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
          align: getAlign(columnSettings["text_align"]),
          variant:
            isPK(col) || isFK(col) ? ("pill" as const) : ("text" as const),
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
      [S.context]: index >= contextStart && index < contextStart + contextCount,
      [S.result]: index === resultIndex,
    });

  return (
    <div className={S.container}>
      <table className={S.table}>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} className={cx(cellClassName(index), S.header)}>
                <HeaderCellWrapper align={column.align}>
                  <HeaderCellPill name={column.title} align={column.align} />
                </HeaderCellWrapper>
              </th>
            ))}
            <th className={cx(S.filler, S.header)} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((value, index) => (
                <td key={index} className={cellClassName(index)}>
                  <BodyCell
                    className={S.bodyCell}
                    value={value}
                    columnId={String(index)}
                    rowIndex={rowIndex}
                    align={columns[index].align}
                    variant={columns[index].variant}
                    formatter={(value) =>
                      renderResult != null && index === resultIndex
                        ? renderResult(value)
                        : columns[index].format(value)
                    }
                  />
                </td>
              ))}
              <td className={S.filler} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getAlign(value: unknown): CellAlign {
  return value === "right" || value === "middle" ? value : "left";
}
