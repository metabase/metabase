import { useMemo, useState } from "react";
import { t } from "ttag";

import { Flex, Icon, Menu, Text } from "metabase/ui";
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
  options: DimensionOption[];
  onSelect: (optionName: string) => void;
  disabled?: boolean;
}

export function DimensionPill({
  label,
  icon,
  color,
  options,
  onSelect,
  disabled,
}: DimensionPillProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isPlaceholder = !label;
  const isEmpty = isPlaceholder && options.length === 0;
  const hasMultipleOptions =
    options.length > 1 || (isPlaceholder && options.length > 0);

  const handleSelect = (name: string) => {
    onSelect(name);
    setIsOpen(false);
  };

  let pillLabel: string;
  if (isEmpty) {
    pillLabel = t`No compatible dimensions`;
  } else if (isPlaceholder) {
    pillLabel = t`Select a dimension`;
  } else {
    pillLabel = label;
  }

  const groupedOptions = useMemo(() => {
    const distinctGroups = new Set(
      options.map((o) => o.group?.id).filter(Boolean),
    );
    if (distinctGroups.size <= 1) {
      return null;
    }

    const groups: { groupName: string; items: DimensionOption[] }[] = [];
    let currentGroupId: string | undefined;
    let currentItems: DimensionOption[] = [];
    let currentGroupName = "";

    for (const option of options) {
      const gid = option.group?.id ?? "__main__";
      if (gid !== currentGroupId) {
        if (currentItems.length > 0) {
          groups.push({ groupName: currentGroupName, items: currentItems });
        }
        currentGroupId = gid;
        currentGroupName = option.group?.displayName ?? "";
        currentItems = [option];
      } else {
        currentItems.push(option);
      }
    }
    if (currentItems.length > 0) {
      groups.push({ groupName: currentGroupName, items: currentItems });
    }
    return groups;
  }, [options]);

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
      <Icon
        name={icon ?? "add"}
        size={14}
        c={color as Parameters<typeof Icon>[0]["c"]}
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
    <Menu opened={isOpen} onChange={setIsOpen} position="bottom-start" width={240}>
      <Menu.Target>{pillContent}</Menu.Target>
      <Menu.Dropdown mah="20rem" style={{ overflowY: "auto" }}>
        {groupedOptions
          ? groupedOptions.map((group) => (
              <div key={group.groupName}>
                <Menu.Label>{group.groupName}</Menu.Label>
                {group.items.map((option) => (
                  <Menu.Item
                    key={option.name}
                    leftSection={<Icon name={option.icon} size={16} />}
                    onClick={() => handleSelect(option.name)}
                  >
                    {option.displayName}
                  </Menu.Item>
                ))}
              </div>
            ))
          : options.map((option) => (
              <Menu.Item
                key={option.name}
                leftSection={<Icon name={option.icon} size={16} />}
                onClick={() => handleSelect(option.name)}
              >
                {option.displayName}
              </Menu.Item>
            ))}
      </Menu.Dropdown>
    </Menu>
  );
}
