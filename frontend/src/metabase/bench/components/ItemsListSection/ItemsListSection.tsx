import type React from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { ActionIcon, Box, Button, Flex, Icon } from "metabase/ui";

type ItemsListSectionProps = {
  sectionTitle: React.ReactNode;
  AddButton?: React.ComponentType;
  onAddNewItem: () => void;
  settings?: React.ReactNode | null;
  listItems: React.ReactNode;
  onCollapse?: () => void;
};

export const ItemsListSection = ({
  sectionTitle,
  AddButton,
  onAddNewItem,
  settings,
  listItems,
  onCollapse,
}: ItemsListSectionProps) => {
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
      {settings}
      <Box p="md" style={{ overflow: "auto" }}>
        {listItems}
      </Box>
    </Box>
  );
};
