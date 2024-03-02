import { useMemo } from "react";

import { color } from "metabase/lib/colors";
import type { StackedTooltipModel } from "metabase/visualizations/types";

import { TooltipRow, TooltipTotalRow } from "../TooltipRow";

import {
  DataPointHeader,
  DataPointTableHeader,
  DataPointRoot,
  DataPointTableBody,
  DataPointTable,
  DataPointTableFooter,
} from "./StackedDataTooltip.styled";
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
      [...sortedBodyRows, ...sortedHeaderRows].some(row => row.color != null),
    [sortedHeaderRows, sortedBodyRows],
  );

  // For some charts such as PieChart we intentionally show only certain data rows that do not represent the full data.
  // In order to calculate percentages correctly we provide the grand total value
  const percentCalculationTotal = grandTotal ?? rowsTotal;

  const trimmedBodyRows = groupExcessiveTooltipRows(
    sortedBodyRows,
    MAX_BODY_ROWS,
    hasColorIndicators ? color("text-light") : undefined,
  );

  return (
    <DataPointRoot>
      {headerTitle && (
        <DataPointHeader data-testid="tooltip-header">
          {headerTitle}
        </DataPointHeader>
      )}
      <DataPointTable>
        <DataPointTableHeader hasBottomSpacing={sortedBodyRows.length > 0}>
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
        </DataPointTableHeader>

        {trimmedBodyRows.length > 0 && (
          <DataPointTableBody>
            {trimmedBodyRows.map((row, index) => (
              <TooltipRow
                key={index}
                percent={
                  showPercentages ? getPercent(rowsTotal, row.value) : undefined
                }
                {...row}
              />
            ))}
          </DataPointTableBody>
        )}

        {showTotal && isShowingTotalSensible && (
          <DataPointTableFooter>
            <TooltipTotalRow
              value={totalFormatter(rowsTotal)}
              hasIcon={hasColorIndicators}
              percent={
                showPercentages
                  ? getPercent(percentCalculationTotal, rowsTotal)
                  : undefined
              }
            />
          </DataPointTableFooter>
        )}
      </DataPointTable>
    </DataPointRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StackedDataTooltip;
