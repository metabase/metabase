import type React from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Button,
  type ButtonProps,
  Flex,
  Icon,
} from "metabase/ui";

import S from "./ItemsListSection.module.css";

export const ItemsListAddButton = (props: ButtonProps) => (
  <Button
    leftSection={<Icon name="add" />}
    size="sm"
    aria-label={t`Add`}
    {...props}
  />
);

type ItemsListSectionProps = {
  addButton?: React.ReactNode;
  settings?: React.ReactNode | null;
  listItems: React.ReactNode;
  onCollapse?: () => void;
  testId?: string;
  searchInput?: React.ReactNode;
};

export const ItemsListSection = ({
  addButton,
  settings,
  listItems,
  onCollapse,
  testId,
  searchInput,
}: ItemsListSectionProps) => {
  const hasHeader = !!(settings || addButton || onCollapse);

  return (
    <Box data-testid={testId} className={S.container}>
      {hasHeader && (
        <Flex justify="space-between" align="center" px="lg" py="md">
          <Flex align="center" gap="sm">
            {onCollapse && (
              <ActionIcon
                onClick={onCollapse}
                aria-label={t`Collapse`}
                color="brand"
              >
                <Icon name="arrow_left" c="brand" />
              </ActionIcon>
            )}
            {settings}
          </Flex>
          {addButton && <Flex className={S.addButtonWrapper}>{addButton}</Flex>}
        </Flex>
      )}
      {searchInput && (
        <Box px="lg" pt={hasHeader ? undefined : "md"} pb="md">
          {searchInput}
        </Box>
      )}
      <Box className={S.listItemsContainer}>{listItems}</Box>
    </Box>
  );
};
