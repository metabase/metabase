import React from "react";
import { t } from "ttag";

import { ChartSettingOrderedItems } from "./ChartSettingOrderedItems";

import {
  ChartSettingMessage,
  ChartSettingOrderedRowsRoot,
} from "./ChartSettingOrderedRows.styled";

interface Row {
  rowIndex: number;
  display_name: string;
  enabled: boolean;
}

interface ChartSettingOrderedRowsProps {
  onChange: (rows: Row[]) => void;
  rows: Row[];
  value: Row[];
}

export const ChartSettingOrderedRows = ({
  onChange,
  rows,
  value,
}: ChartSettingOrderedRowsProps) => {
  const handleDisable = (row: any) => {
    const rowsCopy = [...value];
    const index = rowsCopy.findIndex((r: Row) => r.rowIndex === row.rowIndex);
    rowsCopy[index] = { ...rowsCopy[index], enabled: !row.enabled };
    onChange(rowsCopy);
  };

  const handleSortEnd = ({
    oldIndex,
    newIndex,
  }: {
    oldIndex: number;
    newIndex: number;
  }) => {
    const rowsCopy = [...value];
    rowsCopy.splice(newIndex, 0, rowsCopy.splice(oldIndex, 1)[0]);
    onChange(rowsCopy);
  };

  const getRowTitle = (row: Row) => {
    return (
      rows.find((r: Row) => r.rowIndex === row.rowIndex)?.display_name ||
      "Unknown"
    );
  };

  return (
    <ChartSettingOrderedRowsRoot>
      {value.length > 0 ? (
        <ChartSettingOrderedItems
          items={value}
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
