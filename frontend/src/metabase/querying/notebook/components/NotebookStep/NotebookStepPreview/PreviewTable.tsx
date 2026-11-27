import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import {
  BodyCell,
  type CellAlign,
  HeaderCellPill,
  HeaderCellWrapper,
} from "metabase/data-grid";
import { Flex, Icon } from "metabase/ui";
import { formatValue } from "metabase/value-formatting";
import { getComputedSettingsForSeries } from "metabase/viz-core";
import { isFK, isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RawSeries, RowValues } from "metabase-types/api";

import S from "./PreviewTable.module.css";

type PreviewTableProps = {
  rawSeries: RawSeries;
  cols: DatasetColumn[];
  rows: RowValues[];
  /**
   * The index of the first result column, like the first custom column. A
   * dashed line separates the results from the columns that they use.
   */
  resultStart?: number;
  /** True when the results are filters: they show as Matches or Excluded. */
  isFilter?: boolean;
  /**
   * The index of the column that tells if a row passes all the filters. It
   * shows as Included or Excluded, after a dashed line.
   */
  totalIndex?: number;
};

/**
 * A plain table of the preview rows, with the header and body cells of the
 * data grid. The values have the same format and alignment as in a table
 * question, and keys show as pills.
 */
export function PreviewTable({
  rawSeries,
  cols,
  rows,
  resultStart,
  isFilter = false,
  totalIndex,
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
  const cellClassName = (index: number) =>
    cx(S.cell, {
      [S.result]: (index === resultStart && index > 0) || index === totalIndex,
      [S.total]: index === totalIndex,
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
                    formatter={
                      index === totalIndex
                        ? renderTotal
                        : isFilter &&
                            resultStart != null &&
                            index >= resultStart
                          ? renderFilterResult
                          : columns[index].format
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

function renderFilterResult(value: RowValues[number]) {
  const isMatch = value === true;
  return (
    <Flex align="center" gap="xs">
      <Icon name={isMatch ? "check" : "close"} size={12} c="text-disabled" />
      {isMatch ? t`Matches` : t`Excluded`}
    </Flex>
  );
}

function renderTotal(value: RowValues[number]) {
  const isIncluded = value === true;
  return (
    <Flex align="center" gap="xs">
      <Icon
        name={isIncluded ? "check" : "close"}
        size={12}
        c={isIncluded ? "feedback-positive" : "text-disabled"}
      />
      {isIncluded ? t`Included` : t`Excluded`}
    </Flex>
  );
}
