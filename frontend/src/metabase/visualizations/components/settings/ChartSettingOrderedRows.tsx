import { updateIn } from "icepick";
import React from "react";
import { t } from "ttag";

import { ChartSettingOrderedItems } from "./ChartSettingOrderedItems";

import {
  ChartSettingMessage,
  ChartSettingOrderedRowsRoot,
} from "./ChartSettingOrderedRows.styled";

interface Row {
  enabled: boolean;
  rowIndex: number;
  name: string;
}

interface ChartSettingOrderedRowsProps {
  onChange: (rows: Row[]) => void;
  rows: Row[];
  value: Row[];
}

export const ChartSettingOrderedRows = ({
  onChange,
  rows,
  value: orderedRows,
}: ChartSettingOrderedRowsProps) => {
  const handleDisable = (row: Row) => {
    const index = orderedRows.findIndex(r => r.rowIndex === row.rowIndex);
    onChange(
      updateIn(orderedRows, [index], row => ({
        ...row,
        enabled: !row.enabled,
      })),
    );
  };

  const handleSortEnd = ({
    oldIndex,
    newIndex,
  }: {
    oldIndex: number;
    newIndex: number;
  }) => {
    const rowsCopy = [...orderedRows];
    rowsCopy.splice(newIndex, 0, rowsCopy.splice(oldIndex, 1)[0]);
    onChange(rowsCopy);
  };

  const getRowTitle = (row: Row) => {
    return rows.find(r => r.rowIndex === row.rowIndex)?.name || "Unknown";
  };

  return (
    <ChartSettingOrderedRowsRoot>
      {orderedRows.length > 0 ? (
        <ChartSettingOrderedItems
          items={orderedRows}
          getItemName={getRowTitle}
          onRemove={handleDisable}
          onEnable={handleDisable}
          onSortEnd={handleSortEnd}
          distance={5}
        />
      ) : (
        <ChartSettingMessage>{t`Nothing to order`}</ChartSettingMessage>
      )}
    </ChartSettingOrderedRowsRoot>
  );
};
