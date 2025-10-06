import type React from "react";
import { useState } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Box, Button, Flex, Group, Icon, Menu } from "metabase/ui";

import type { BenchItemsListSorting } from "./types";

type ItemsListSectionProps = {
  sectionTitle: React.ReactNode;
  titleMenuItems: React.ReactNode;
  AddButton?: React.ComponentType;
  onChangeSorting: (sorting: BenchItemsListSorting) => void;
  onAddNewItem: () => void;
  listItems: React.ReactNode;
};

export const ItemsListSection = ({
  sectionTitle,
  titleMenuItems,
  AddButton,
  onChangeSorting,
  onAddNewItem,
  listItems,
}: ItemsListSectionProps) => {
  const [isFiltersMenuOpen, setIsFiltersMenuOpen] = useState(false);
  const [isSortingMenuOpen, setIsSortingMenuOpen] = useState(false);

  return (
    <Box w="100%" h="100%" style={{ display: "flex", flexDirection: "column" }}>
      <Flex direction="row" justify="space-between" align="center" p="md">
        <Ellipsified fz="lg" fw="bold">
          {sectionTitle}
        </Ellipsified>
        <Flex style={{ flexShrink: 0 }}>
          {AddButton ? (
            <AddButton />
          ) : (
            <Button
              leftSection={<Icon name="add" />}
              size="sm"
              aria-label={t`Add`}
              onClick={onAddNewItem}
            />
          )}
        </Flex>
      </Flex>
      <Group px="md" gap="sm">
        {/* Filters */}
        <Menu
          opened={isFiltersMenuOpen}
          onClose={() => setIsFiltersMenuOpen(false)}
          position="bottom-start"
          shadow="md"
          width={200}
        >
          <Menu.Target>
            <Button
              onClick={() => setIsFiltersMenuOpen(!isFiltersMenuOpen)}
              size="compact-md"
              radius="xl"
              c="filter"
              bg="color-mix(in srgb, var(--mb-color-filter), white 80%)"
              rightSection={
                <Icon
                  name="chevrondown"
                  size={12}
                  style={{
                    transform: isFiltersMenuOpen
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                />
              }
            >
              {t`All`}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>{titleMenuItems}</Menu.Dropdown>
        </Menu>

        {/* Sorting */}
        <Menu
          opened={isSortingMenuOpen}
          onClose={() => setIsSortingMenuOpen(false)}
          position="bottom-start"
          shadow="md"
          width={200}
        >
          <Menu.Target>
            <Button
              onClick={() => setIsSortingMenuOpen(!isSortingMenuOpen)}
              size="compact-md"
              radius="xl"
              c="filter"
              bg="color-mix(in srgb, var(--mb-color-filter), white 80%)"
              rightSection={
                <Icon
                  name="chevrondown"
                  size={12}
                  style={{
                    transform: isSortingMenuOpen
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                />
              }
            >
              {t`Date created`}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              onClick={() => onChangeSorting("alphabetical")}
            >{t`Alphabetical`}</Menu.Item>
            <Menu.Item
              onClick={() => onChangeSorting("most-recent")}
            >{t`Most recent`}</Menu.Item>
            <Menu.Item
              onClick={() => onChangeSorting("least-recent")}
            >{t`Least recent`}</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Box p="md" style={{ overflow: "auto" }}>
        {listItems}
      </Box>
    </Box>
  );
};
