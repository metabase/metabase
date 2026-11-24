import { t } from "ttag";

import { Box, Paper, Text } from "metabase/ui";

export function ReadOnlyToast() {
  return (
    <Box pos="fixed" bottom="1rem" left={0} right={0} px="md">
      <Paper role="status" shadow="md" withBorder p="md" maw="30rem" mx="auto">
        <Text>{t`This preview is read-only, so your change wasn't saved.`}</Text>
      </Paper>
    </Box>
  );
}
