import cx from "classnames";
import { useMemo } from "react";

import { color } from "metabase/ui/colors";
import type { StackedTooltipModel } from "metabase/visualizations/types";

import { TooltipRow, TooltipTotalRow } from "../TooltipRow";

import S from "./StackedDataTooltip.module.css";
import {
  getPercent,
  getSortedRows,
  getTotalValue,
  groupExcessiveTooltipRows,
} from "./utils";

const MAX_BODY_ROWS = 8;

type StackedDataTooltipProps = StackedTooltipModel;

const StackedDataTooltip = ({
  headerTitle,
  headerRows,
  bodyRows = [],
  grandTotal,
  showTotal,
  showPercentages,
  totalFormatter = (value: unknown) => String(value),
}: StackedDataTooltipProps) => {
  const sortedHeaderRows = useMemo(
    () => getSortedRows(headerRows),
    [headerRows],
  );
  const sortedBodyRows = useMemo(() => getSortedRows(bodyRows), [bodyRows]);
  const rowsTotal = useMemo(
    () => getTotalValue(sortedHeaderRows, sortedBodyRows),
    [sortedHeaderRows, sortedBodyRows],
  );

  const isShowingTotalSensible =
    sortedHeaderRows.length + sortedBodyRows.length > 1;
  const hasColorIndicators = useMemo(
    () =>
      [...sortedBodyRows, ...sortedHeaderRows].some((row) => row.color != null),
    [sortedHeaderRows, sortedBodyRows],
  );

  // For some charts such as PieChart we intentionally show only certain data rows that do not represent the full data.
  // In order to calculate percentages correctly we provide the grand total value
  const percentCalculationTotal = grandTotal ?? rowsTotal;

  const trimmedBodyRows = groupExcessiveTooltipRows(
    sortedBodyRows,
    MAX_BODY_ROWS,
    hasColorIndicators ? color("text-tertiary") : undefined,
  );

  return (
    <div className={S.dataPointRoot}>
      {headerTitle && (
        <header className={S.dataPointHeader} data-testid="tooltip-header">
          {headerTitle}
        </header>
      )}
      <table className={S.dataPointTable}>
        <thead
          className={cx({
            [S.tableRowSpacing]: sortedBodyRows.length > 0,
          })}
        >
          {sortedHeaderRows.map((row, index) => (
            <TooltipRow
              key={index}
              isHeader
              percent={
                showPercentages ? getPercent(rowsTotal, row.value) : undefined
              }
              {...row}
            />
          ))}
        </thead>

        {trimmedBodyRows.length > 0 && (
          <tbody className={S.dataPointTableBody}>
            {trimmedBodyRows.map((row, index) => (
              <TooltipRow
                key={index}
                percent={
                  showPercentages ? getPercent(rowsTotal, row.value) : undefined
                }
                {...row}
              />
            ))}
          </tbody>
        )}

        {showTotal && isShowingTotalSensible && (
          <tfoot className={S.dataPointTableFooter}>
            <TooltipTotalRow
              value={totalFormatter(rowsTotal)}
              hasIcon={hasColorIndicators}
              percent={
                showPercentages
                  ? getPercent(percentCalculationTotal, rowsTotal)
                  : undefined
              }
            />
          </tfoot>
        )}
      </table>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StackedDataTooltip;
