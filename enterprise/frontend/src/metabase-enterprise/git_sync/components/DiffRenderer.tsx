import type { ReactNode } from "react";
import { t } from "ttag";

import { Box, Center, Flex, Stack, Text } from "metabase/ui";
import type { GitDiff } from "metabase-types/api";

interface DiffRendererProps {
  diff: GitDiff;
  renderContent: (entity: any, type: "original" | "current") => ReactNode;
  height?: string | number;
}

export function DiffRenderer({
  diff,
  renderContent,
  height = "400px",
}: DiffRendererProps) {
  if (diff.status === "added" && diff.current) {
    return (
      <Stack gap="md" p="md">
        {renderContent(diff.current, "current")}
      </Stack>
    );
  }

  if (diff.status === "deleted" && diff.original) {
    return (
      <Stack gap="md" p="md">
        <Box opacity={0.7}>{renderContent(diff.original, "original")}</Box>
      </Stack>
    );
  }

  if (diff.status === "modified" && diff.original && diff.current) {
    return (
      <Box p="md" style={{ minHeight: height }}>
        <Flex gap="md" h={height}>
          <Box flex={1}>
            <Text
              fw={600}
              c="text-medium"
              size="sm"
              mb="md"
            >{t`Original`}</Text>
            {renderContent(diff.original, "original")}
          </Box>
          <Box flex={1}>
            <Text fw={600} c="brand" size="sm" mb="md">{t`Current`}</Text>
            {renderContent(diff.current, "current")}
          </Box>
        </Flex>
      </Box>
    );
  }

  return (
    <Center h={height}>
      <Text c="text-medium" size="sm">{t`No content available`}</Text>
    </Center>
  );
}
