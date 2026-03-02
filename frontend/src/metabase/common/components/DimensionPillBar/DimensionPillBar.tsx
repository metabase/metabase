import cx from "classnames";

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
  onDimensionChange: (
    itemId: string | number,
    dimension: DimensionMetadata,
  ) => void;
  disabled?: boolean;
  classNames?: Partial<{
    pillBar: string;
    pill: string;
  }>;
}

export function DimensionPillBar({
  items,
  onDimensionChange,
  disabled,
  classNames,
}: DimensionPillBarProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Flex
      className={cx(S.bar, classNames?.pillBar)}
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
          className={classNames?.pill}
        />
      ))}
    </Flex>
  );
}
