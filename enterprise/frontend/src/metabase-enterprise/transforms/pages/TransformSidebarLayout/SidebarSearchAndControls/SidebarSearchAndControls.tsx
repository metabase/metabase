import type { ReactNode } from "react";
import { t } from "ttag";

import { Button, Group, Icon, Menu, TextInput, Tooltip } from "metabase/ui";

import type { SortOptionData } from "../SidebarSortControl";

import S from "./SidebarSearchAndControls.module.css";

interface SidebarSearchAndControlsProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  sortValue: string;
  sortOptions: SortOptionData[];
  onSortChange: (value: string) => void;
  addButton?: ReactNode;
  searchPlaceholder?: string;
  sortLabel?: string;
}

export const SidebarSearchAndControls = ({
  searchValue,
  onSearchChange,
  sortValue,
  sortOptions,
  onSortChange,
  addButton,
  searchPlaceholder = t`Search…`,
  sortLabel = t`Sort`,
}: SidebarSearchAndControlsProps) => {
  return (
    <Group gap="sm" wrap="nowrap">
      <TextInput
        flex={1}
        size="xs"
        placeholder={searchPlaceholder}
        leftSection={<Icon name="search" />}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        classNames={{ input: S.input }}
        styles={{ input: { fontSize: 14, paddingLeft: 32 } }}
      />
      <Menu position="bottom-end">
        <Menu.Target>
          <Tooltip label={sortLabel}>
            <Button
              p="sm"
              w={32}
              h={32}
              aria-label={sortLabel}
              leftSection={<Icon name="sort" size={16} />}
              classNames={{ root: S.button }}
            />
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          {sortOptions.map((option) => (
            <Menu.Item
              key={option.value}
              onClick={() => onSortChange(option.value)}
              rightSection={
                sortValue === option.value ? <Icon name="check" /> : null
              }
            >
              {option.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      {addButton}
    </Group>
  );
};
