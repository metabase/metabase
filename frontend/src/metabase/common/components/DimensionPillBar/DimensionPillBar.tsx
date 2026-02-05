import { Flex } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { DimensionPill } from "../DimensionPill";

import S from "./DimensionPillBar.module.css";

export interface DimensionItem {
  id: string | number;
  query: Lib.Query;
  stageIndex: number;
  column?: Lib.ColumnMetadata;
  color?: string;
}

export interface DimensionPillBarProps {
  items: DimensionItem[];
  columnFilter?: (col: Lib.ColumnMetadata) => boolean;
  onDimensionChange: (
    itemId: string | number,
    newColumn: Lib.ColumnMetadata,
  ) => void;
  disabled?: boolean;
}

export function DimensionPillBar({
  items,
  columnFilter,
  onDimensionChange,
  disabled,
}: DimensionPillBarProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Flex className={S.bar} align="center" justify="center" gap="sm" wrap="wrap">
      {items.map((item) => (
        <DimensionPill
          key={item.id}
          query={item.query}
          stageIndex={item.stageIndex}
          column={item.column}
          color={item.color}
          columnFilter={columnFilter}
          onColumnChange={(newCol) => onDimensionChange(item.id, newCol)}
          disabled={disabled}
        />
      ))}
    </Flex>
  );
}
