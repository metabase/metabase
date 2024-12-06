import { t } from "ttag";

import { Box, Flex, Stack, Text } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { DataTypeStack } from "./DataTypeStack";

type ListItemProps = {
  card: Card;
  isSelected: boolean;
  isMuted?: boolean;
  onSelect: () => void;
};

export function ListItem({
  card,
  isSelected,
  isMuted = false,
  onSelect,
}: ListItemProps) {
  return (
    <Box
      component="li"
      px={14}
      py={10}
      mb={4}
      style={{
        border: "1px solid var(--mb-color-border)",
        borderRadius: 5,
        cursor: "pointer",
        backgroundColor: isSelected
          ? "var(--mb-color-bg-medium)"
          : "transparent",
        opacity: isMuted ? 0.5 : 1,
      }}
      onClick={onSelect}
    >
      <Flex direction="row" align="center" justify="space-between" w="100%">
        <Stack spacing="xs" maw="75%">
          <Text truncate fw="bold">
            {card.name}
          </Text>
          <Text truncate c="text-medium" size="sm">
            {card.collection?.name ?? t`Our analytics`}
          </Text>
        </Stack>
        <DataTypeStack columns={card.result_metadata} />
      </Flex>
    </Box>
  );
}
