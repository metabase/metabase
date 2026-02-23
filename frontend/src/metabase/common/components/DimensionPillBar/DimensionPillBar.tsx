import type { IconName } from "metabase/ui";
import { Flex } from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";

import type { DimensionOption } from "../DimensionPill";
import { DimensionPill } from "../DimensionPill";

import S from "./DimensionPillBar.module.css";

export interface DimensionItem {
  id: string | number;
  label?: string;
  icon?: IconName;
  colors?: string[];
  availableOptions: DimensionOption[];
}

export interface DimensionPillBarProps {
  items: DimensionItem[];
  onDimensionChange: (itemId: string | number, dimension: DimensionMetadata) => void;
  disabled?: boolean;
}

export function DimensionPillBar({
  items,
  onDimensionChange,
  disabled,
}: DimensionPillBarProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Flex
      className={S.bar}
      align="center"
      justify="center"
      gap="sm"
      wrap="wrap"
    >
      {items.map((item) => (
        <DimensionPill
          key={item.id}
          label={item.label}
          icon={item.icon}
          colors={item.colors}
          options={item.availableOptions}
          onSelect={(dimension) => onDimensionChange(item.id, dimension)}
          disabled={disabled}
        />
      ))}
    </Flex>
  );
}
