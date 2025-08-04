import { t } from "ttag";

import { Box, Button, Group, Stack, Text } from "metabase/ui/components";

interface DetailViewSidebarProps {
  onCancel: () => void;
  onSubmit: () => void;
}

export function DetailViewSidebar({
  onCancel,
  onSubmit,
}: DetailViewSidebarProps) {
  return (
    <Stack gap={0} h="100%">
      <Box
        flex="0 0 auto"
        px="xl"
        py="lg"
        style={{
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <Text fw={600} size="lg">{t`Detail view settings`}</Text>
      </Box>

      <Box flex="1" px="xl" pb="xl" pt={16} style={{ overflow: "auto" }}>
        TODO
      </Box>

      <Box
        flex="0 0 auto"
        bg="white"
        px="xl"
        py="md"
        style={{
          borderTop: "1px solid var(--border-color)",
        }}
      >
        <Group gap="md" justify="space-between">
          <Group gap="md">
            <Button size="sm" variant="subtle" onClick={onCancel}>
              {t`Cancel`}
            </Button>
          </Group>

          <Button size="sm" type="submit" variant="filled" onClick={onSubmit}>
            {t`Save`}
          </Button>
        </Group>
      </Box>
    </Stack>
  );
}
