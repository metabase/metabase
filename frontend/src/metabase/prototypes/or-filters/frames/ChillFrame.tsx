import type { ReactNode } from "react";
import { t } from "ttag";

import { Box, Button, Group, Icon, Paper, Text, Title } from "metabase/ui";

type ChillFrameProps = {
  filterButton?: ReactNode;
  isHidden?: boolean;
  children: ReactNode;
};

/** A fake query-builder view header, so the strip is judged where it lives. */
export function ChillFrame({
  filterButton,
  isHidden = false,
  children,
}: ChillFrameProps) {
  return (
    <Paper withBorder radius="md" p={0}>
      <Group
        justify="space-between"
        px="lg"
        py="md"
        style={
          isHidden
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
        <Group gap="xs">
          {filterButton ?? (
            <Button
              size="compact-md"
              variant="default"
              leftSection={<Icon name="filter" />}
            >
              {t`Filter`}
            </Button>
          )}
          <Button
            size="compact-md"
            variant="default"
            leftSection={<Icon name="sum" />}
          >
            {t`Summarize`}
          </Button>
        </Group>
      </Group>
      {!isHidden && (
        <Box px="lg" py="sm" mih={48}>
          {children}
        </Box>
      )}
    </Paper>
  );
}
