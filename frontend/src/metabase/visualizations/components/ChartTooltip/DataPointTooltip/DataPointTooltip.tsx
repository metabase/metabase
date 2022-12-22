import React from "react";
import {
  DataPointDimension,
  DataPointTableHeader,
  DataPointRoot,
  DataPointTableBody,
  DataPointTable,
  DataPointTableFooter,
} from "./DataPointTooltip.styled";
import { TooltipRow, TooltipTotalRow } from "./TooltipRow";
import { TooltipModel } from "./types";

type DataPointTooltipProps = TooltipModel;

const DataPointTooltip = ({
  headerTitle,
  headerRows,
  bodyRows,
  totalValue,
}: DataPointTooltipProps) => {
  return (
    <DataPointRoot>
      {headerTitle && <DataPointDimension>{headerTitle}</DataPointDimension>}
      <DataPointTable>
        <DataPointTableHeader>
          {headerRows.map((row, index) => (
            <TooltipRow key={index} colorIndicatorSize={12} {...row} />
          ))}
        </DataPointTableHeader>

        {bodyRows && (
          <DataPointTableBody>
            {bodyRows?.map((row, index) => (
              <TooltipRow key={index} {...row} />
            ))}
          </DataPointTableBody>
        )}

        {totalValue != null && bodyRows && bodyRows.length > 0 && (
          <DataPointTableFooter>
            <TooltipTotalRow value={totalValue} />
          </DataPointTableFooter>
        )}
      </DataPointTable>
    </DataPointRoot>
  );
};

export default DataPointTooltip;
