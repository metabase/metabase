import type { ReactNode } from "react";
import { t } from "ttag";

import { Box, Flex, Group, Paper, Text, Title } from "metabase/ui";

type ChillFrameProps = {
  filterButton?: ReactNode;
  isHidden?: boolean;
  /** Rendered under the filter strip, where the question's results would be. */
  results?: ReactNode;
  children: ReactNode;
};

/** A fake query-builder view header, so the strip is judged where it lives. */
export function ChillFrame({
  filterButton,
  isHidden = false,
  results,
  children,
}: ChillFrameProps) {
  return (
    <Paper withBorder radius="md" p={0}>
      <Group
        justify="space-between"
        px="lg"
        py="md"
        style={
          isHidden && !results
            ? undefined
            : { borderBottom: "1px solid var(--mb-color-border-neutral)" }
        }
      >
        <Box>
          <Text size="sm" c="text-secondary">
            {t`Sample Database / Orders`}
          </Text>
          <Title order={3}>{t`Orders`}</Title>
        </Box>
        {filterButton}
      </Group>
      {!isHidden && (
        <Flex
          direction="column"
          justify="center"
          px="lg"
          py="sm"
          mih={48}
          style={
            results
              ? { borderBottom: "1px solid var(--mb-color-border-neutral)" }
              : undefined
          }
        >
          {children}
        </Flex>
      )}
      {results && <Box p="lg">{results}</Box>}
    </Paper>
  );
}
