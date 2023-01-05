import React from "react";
import { TooltipRow, TooltipTotalRow } from "../TooltipRow";
import { TooltipModel } from "../types";
import {
  DataPointHeader,
  DataPointTableHeader,
  DataPointRoot,
  DataPointTableBody,
  DataPointTable,
  DataPointTableFooter,
} from "./DataPointTooltip.styled";
import { getPercent, getTotalValue } from "./utils";

type DataPointTooltipProps = TooltipModel;

const DataPointTooltip = ({
  headerTitle,
  headerRows,
  bodyRows = [],
  showTotal,
  showPercentages,
  totalFormatter = (value: unknown) => String(value),
}: DataPointTooltipProps) => {
  const total = getTotalValue(headerRows, bodyRows);
  const isShowingTotalSensible = headerRows.length + bodyRows.length > 1;

  return (
    <DataPointRoot>
      {headerTitle && (
        <DataPointHeader data-testid="tooltip-header">
          {headerTitle}
        </DataPointHeader>
      )}
      <DataPointTable>
        <DataPointTableHeader hasBottomSpacing={bodyRows.length > 0}>
          {headerRows.map((row, index) => (
            <TooltipRow
              key={index}
              isHeader
              percent={
                showPercentages ? getPercent(total, row.value) : undefined
              }
              {...row}
            />
          ))}
        </DataPointTableHeader>

        {bodyRows.length > 0 && (
          <DataPointTableBody>
            {bodyRows.map((row, index) => (
              <TooltipRow
                key={index}
                percent={
                  showPercentages ? getPercent(total, row.value) : undefined
                }
                {...row}
              />
            ))}
          </DataPointTableBody>
        )}

        {showTotal && isShowingTotalSensible && (
          <DataPointTableFooter>
            <TooltipTotalRow
              value={totalFormatter(total)}
              showPercentages={showPercentages}
            />
          </DataPointTableFooter>
        )}
      </DataPointTable>
    </DataPointRoot>
  );
};

export default DataPointTooltip;
