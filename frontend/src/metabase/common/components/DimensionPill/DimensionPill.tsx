import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  AccordionList,
  type Section,
} from "metabase/common/components/AccordionList";
import { Box, Flex, Icon, Popover, Text } from "metabase/ui";
import type { IconName } from "metabase/ui";

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
  group?: DimensionOptionGroup;
}

export interface DimensionPillProps {
  label?: string;
  icon?: IconName;
  color?: string;
  colors?: string[];
  options: DimensionOption[];
  onSelect: (optionName: string) => void;
  disabled?: boolean;
}

export function DimensionPill({
  label,
  icon,
  color,
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
      onSelect(item.name);
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
      {colors && colors.length > 0 ? (
        <Flex align="center" gap={2}>
          {colors.map((c, i) => (
            <Box
              key={i}
              w={8}
              h={8}
              style={{
                borderRadius: "50%",
                backgroundColor: c,
                flexShrink: 0,
              }}
            />
          ))}
        </Flex>
      ) : (
        <Icon
          name={icon ?? "add"}
          size={14}
          c={color as Parameters<typeof Icon>[0]["c"]}
        />
      )}
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
          alwaysExpanded
          maxHeight={Infinity}
          width={240}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
