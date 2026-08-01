import { t } from "ttag";

import { Center, Loader, Stack, Text } from "metabase/ui";

/** Stands in for a scope's content while its branch is being pulled in. */
export function BranchSyncProgress() {
  return (
    <Center h="100%" data-testid="branch-sync-progress">
      <Stack align="center" gap="sm">
        <Loader />
        <Text c="text-secondary">{t`Loading this branch's content…`}</Text>
      </Stack>
    </Center>
  );
}
