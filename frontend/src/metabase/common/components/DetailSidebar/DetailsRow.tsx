import { Box, Divider, Flex, Text } from "metabase/ui";

import type { DetailsRowProps } from "./types";

export const DetailsRow = ({
  label,
  value,
  bold,
  spanLabel,
  fillValue,
  labelNote,
  labelAside,
}: DetailsRowProps) => {
  if (spanLabel) {
    return (
      <Flex align="center" px="lg" py="sm" bg="background_page-primary">
        <Text size="md" c="text-secondary">
          {label}
        </Text>
      </Flex>
    );
  }
  return (
    <Flex>
      <Flex
        w={184}
        direction="column"
        align="flex-start"
        gap="xs"
        px="lg"
        py="sm"
        bg="background_page-secondary"
      >
        <Flex w="100%" align="center" justify="space-between" gap="xs">
          <Text size="md" c="text-secondary">
            {label}
          </Text>
          {labelAside}
        </Flex>
        {labelNote}
      </Flex>
      <Divider orientation="vertical" />
      <Flex
        flex={1}
        align={fillValue ? "stretch" : "center"}
        px={fillValue ? 0 : "lg"}
        py={fillValue ? 0 : "sm"}
        miw={0}
      >
        {typeof value === "string" ? (
          <Text size="md" fw={bold ? "bold" : "normal"} c="text-primary">
            {value}
          </Text>
        ) : (
          <Box w="100%" display={fillValue ? "flex" : undefined}>
            {value}
          </Box>
        )}
      </Flex>
    </Flex>
  );
};
