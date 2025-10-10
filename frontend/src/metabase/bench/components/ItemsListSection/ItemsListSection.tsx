import type React from "react";
import { useState } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { ActionIcon, Box, Button, Flex, Group, Icon, Menu } from "metabase/ui";

import type { BenchItemsListSorting } from "./types";

type ItemsListSectionProps = {
  sectionTitle: React.ReactNode;
  titleMenuItems: React.ReactNode;
  AddButton?: React.ComponentType;
  sorting?: BenchItemsListSorting;
  onChangeSorting: (sorting: BenchItemsListSorting) => void;
  onAddNewItem: () => void;
  listItems: React.ReactNode;
  onCollapse?: () => void;
};

export const ItemsListSection = ({
  sectionTitle,
  titleMenuItems,
  AddButton,
  sorting,
  onChangeSorting,
  onAddNewItem,
  listItems,
  onCollapse,
}: ItemsListSectionProps) => {
  const [isFiltersMenuOpen, setIsFiltersMenuOpen] = useState(false);
  const [isSortingMenuOpen, setIsSortingMenuOpen] = useState(false);
  const sortingLabels: Record<BenchItemsListSorting, string> = {
    alphabetical: t`Alphabetical`,
    collection: t`By collection`,
    "least-recent": t`Least recent`,
    "most-recent": t`Most recent`,
  };

  return (
    <Box w="100%" h="100%" style={{ display: "flex", flexDirection: "column" }}>
      <Flex justify="space-between" align="center" p="md">
        <Flex align="center" gap="sm">
          {onCollapse && (
            <ActionIcon
              onClick={onCollapse}
              aria-label={t`Collapse`}
              color="brand"
            >
              <Icon name="arrow_left" c="brand" /> {}
            </ActionIcon>
          )}
          <Ellipsified fz="lg" fw="bold">
            {sectionTitle}
          </Ellipsified>
        </Flex>
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
              bg="color-mix(in srgb, var(--mb-color-filter), var(--mb-color-white) 80%)"
              bd="none"
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
              bg="color-mix(in srgb, var(--mb-color-filter), var(--mb-color-white) 80%)"
              bd="none"
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
              {sorting ? sortingLabels[sorting] : t`Date created`}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              onClick={() => onChangeSorting("collection")}
            >{t`By collection`}</Menu.Item>
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
