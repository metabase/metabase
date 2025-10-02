import type React from "react";
import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Group, Icon, Menu, Text } from "metabase/ui";

import type { BenchItemsListSorting } from "./types";

type ItemsListSectionProps = {
  sectionTitle: React.ReactNode;
  titleMenuItems: React.ReactNode;
  onChangeSorting: (sorting: BenchItemsListSorting) => void;
  onAddNewItem: () => void;

  listItems: React.ReactNode;
};

export const ItemsListSection = ({
  sectionTitle,
  titleMenuItems,
  onChangeSorting,
  onAddNewItem,
  listItems,
}: ItemsListSectionProps) => {
  const [isFiltersMenuOpen, setIsFiltersMenuOpen] = useState(false);
  const [isSortingMenuOpen, setIsSortingMenuOpen] = useState(false);

  return (
    <Box w="100%" h="100%" style={{ display: "flex", flexDirection: "column" }}>
      <Flex direction="row" justify="space-between" align="center" p="md">
        <Menu
          // filters
          opened={isFiltersMenuOpen}
          onClose={() => setIsFiltersMenuOpen(false)}
          position="bottom-start"
          shadow="md"
          width={200}
        >
          <Menu.Target>
            <Group
              gap="sm"
              style={{
                cursor: "pointer",
                userSelect: "none",
              }}
              onClick={() => setIsFiltersMenuOpen(!isFiltersMenuOpen)}
            >
              <Text size="lg" fw="bold" c="brand">
                {sectionTitle}
              </Text>
              <Icon
                name="chevrondown"
                size={12}
                c="brand"
                style={{
                  transform: isFiltersMenuOpen
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </Group>
          </Menu.Target>
          <Menu.Dropdown>{titleMenuItems}</Menu.Dropdown>
        </Menu>

        <Group>
          <Menu
            // sorting
            opened={isSortingMenuOpen}
            onClose={() => setIsSortingMenuOpen(false)}
            position="bottom-start"
            shadow="md"
            width={200}
          >
            <Menu.Target>
              <Group
                gap="sm"
                style={{
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => setIsSortingMenuOpen(!isSortingMenuOpen)}
              >
                <Icon name="sort_arrows" size={12} c="brand" />
                <Icon
                  name="chevrondown"
                  size={12}
                  c="brand"
                  style={{
                    transform: isFiltersMenuOpen
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                />
              </Group>
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

          <Button
            variant="filled"
            color="brand"
            compact
            leftSection={<Icon name="add" size={12} />}
            onClick={onAddNewItem}
          />
        </Group>
      </Flex>
      <Box p="md" style={{ overflow: "auto" }}>
        {listItems}
      </Box>
    </Box>
  );
};
