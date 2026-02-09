import { Flex } from "metabase/ui";
import type { IconName } from "metabase/ui";

import type { DimensionOption } from "../DimensionPill";
import { DimensionPill } from "../DimensionPill";

import S from "./DimensionPillBar.module.css";

export interface DimensionItem {
  id: string | number;
  label?: string;
  icon?: IconName;
  color?: string;
  availableOptions: DimensionOption[];
}

export interface DimensionPillBarProps {
  items: DimensionItem[];
  onDimensionChange: (itemId: string | number, optionName: string) => void;
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
          color={item.color}
          options={item.availableOptions}
          onSelect={(optionName) => onDimensionChange(item.id, optionName)}
          disabled={disabled}
        />
      ))}
    </Flex>
  );
}
