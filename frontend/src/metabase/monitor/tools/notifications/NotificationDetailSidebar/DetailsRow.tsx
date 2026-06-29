import { Box, Divider, Flex, Text } from "metabase/ui";

import type { DetailsRowProps } from "./types";

export const DetailsRow = ({
  label,
  value,
  bold,
  spanLabel,
}: DetailsRowProps) => {
  if (spanLabel) {
    return (
      <Flex align="center" px="md" py="sm" bg="background_page-primary">
        <Text size="md" c="text-secondary">
          {label}
        </Text>
      </Flex>
    );
  }
  return (
    <Flex>
      <Flex w={160} px="md" py="sm" bg="background_page-secondary">
        <Text size="md" c="text-secondary">
          {label}
        </Text>
      </Flex>
      <Divider orientation="vertical" />
      <Flex flex={1} align="center" px="md" py="sm" miw={0}>
        {typeof value === "string" ? (
          <Text size="md" fw={bold ? "bold" : "normal"} c="text-primary">
            {value}
          </Text>
        ) : (
          <Box w="100%">{value}</Box>
        )}
      </Flex>
    </Flex>
  );
};
