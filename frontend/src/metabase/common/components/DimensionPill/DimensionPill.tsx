import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  AccordionList,
  type Section,
} from "metabase/common/components/AccordionList";
import { SourceColorIndicator } from "metabase/common/components/SourceColorIndicator";
import type { IconName } from "metabase/ui";
import { Flex, Icon, Popover, Text } from "metabase/ui";
import type { DimensionMetadata } from "metabase-lib/metric";

import S from "./DimensionPill.module.css";

export interface DimensionOptionGroup {
  id: string;
  type: "main" | "connection";
  displayName: string;
}

export interface DimensionOption {
  name: string;
  displayName: string;
  icon: IconName;
  dimension: DimensionMetadata;
  group?: DimensionOptionGroup;
  selected?: boolean;
}

export interface DimensionPillProps {
  label?: string;
  icon?: IconName;
  colors?: string[];
  options: DimensionOption[];
  onSelect: (dimension: DimensionMetadata) => void;
  disabled?: boolean;
}

export function DimensionPill({
  label,
  icon,
  colors,
  options,
  onSelect,
  disabled,
}: DimensionPillProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isPlaceholder = !label;
  const isEmpty = isPlaceholder && options.length === 0;
  const hasMultipleOptions =
    options.length > 1 || (isPlaceholder && options.length > 0);

  const handleSelect = useCallback(
    (item: DimensionOption) => {
      onSelect(item.dimension);
      setIsOpen(false);
    },
    [onSelect],
  );

  let pillLabel: string;
  if (isEmpty) {
    pillLabel = t`No compatible dimensions`;
  } else if (isPlaceholder) {
    pillLabel = t`Select a dimension`;
  } else {
    pillLabel = label;
  }

  const sections: Section<DimensionOption>[] = useMemo(() => {
    const groups = new Map<
      string | undefined,
      { groupName: string; items: DimensionOption[] }
    >();

    for (const option of options) {
      const groupId = option.group?.id;
      const entry = groups.get(groupId);
      if (entry) {
        entry.items.push(option);
      } else {
        groups.set(groupId, {
          groupName: option.group?.displayName ?? "",
          items: [option],
        });
      }
    }

    if (groups.size <= 1) {
      return [{ items: options }];
    }

    return [...groups.values()].map(({ groupName, items }) => ({
      name: groupName,
      items,
    }));
  }, [options]);

  const renderItemName = useCallback(
    (item: DimensionOption) => item.displayName,
    [],
  );

  const renderItemIcon = useCallback(
    (item: DimensionOption) => <Icon name={item.icon} />,
    [],
  );

  const itemIsSelected = useCallback(
    (item: DimensionOption) => item.selected ?? false,
    [],
  );

  const pillContent = (
    <Flex
      className={S.pill}
      align="center"
      gap="xs"
      onClick={
        hasMultipleOptions && !disabled ? () => setIsOpen(true) : undefined
      }
      data-disabled={disabled || isEmpty}
      data-static={!hasMultipleOptions}
      data-placeholder={isPlaceholder || undefined}
    >
      <SourceColorIndicator
        colors={colors}
        fallbackIcon={icon ?? "add"}
      />
      <Text size="sm" lh={1} c={isEmpty ? "text-tertiary" : undefined}>
        {pillLabel}
      </Text>
    </Flex>
  );

  if (!hasMultipleOptions) {
    return pillContent;
  }

  return (
    <Popover opened={isOpen} onChange={setIsOpen} position="top-start">
      <Popover.Target>{pillContent}</Popover.Target>
      <Popover.Dropdown px={0} py="xs" mah={300} style={{ overflowY: "auto" }}>
        <AccordionList
          className={S.dimensionList}
          sections={sections}
          onChange={handleSelect}
          renderItemName={renderItemName}
          renderItemIcon={renderItemIcon}
          itemIsSelected={itemIsSelected}
          alwaysExpanded
          maxHeight={Infinity}
          width={240}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
