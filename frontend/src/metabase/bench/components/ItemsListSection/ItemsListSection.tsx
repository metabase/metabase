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
};

export const ItemsListSection = ({
  addButton,
  settings,
  listItems,
  onCollapse,
  testId,
}: ItemsListSectionProps) => {
  const hasHeader = !!(settings || addButton || onCollapse);

  return (
    <Box
      data-testid={testId}
      w="100%"
      h="100%"
      style={{ display: "flex", flexDirection: "column" }}
    >
      {hasHeader && (
        <Flex justify="space-between" align="center" px="md" py="sm">
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
          {addButton && <Flex style={{ flexShrink: 0 }}>{addButton}</Flex>}
        </Flex>
      )}
      <Box
        px="md"
        pt={hasHeader ? undefined : "md"}
        style={{ overflow: "auto", flex: 1 }}
      >
        {listItems}
      </Box>
    </Box>
  );
};
