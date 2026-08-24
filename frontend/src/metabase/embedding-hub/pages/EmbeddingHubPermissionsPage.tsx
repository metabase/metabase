import { t } from "ttag";

import { EmbeddingHubPermissionsBasePath } from "metabase/admin/permissions/components/EmbeddingHubPermissionsBasePath";
import { Box, Stack, Title } from "metabase/ui";

const TAB_LABEL_INSET = "2.5rem";

/**
 * The admin permissions editor, mounted a second time under the hub. Admin
 * permissions does not change.
 *
 * The tab set is whatever the admin editor already has — five when tenants are
 * on — rather than a narrowed copy, so there is no forked component to keep in
 * sync.
 */
export function EmbeddingHubPermissionsPage() {
  return (
    // White, like admin, not the hub's tinted background.
    <Stack gap="md" h="100%" pt="1.5rem" bg="background_page-primary">
      {/* Full-width page, so it places its own padding here. */}
      <Box pl={TAB_LABEL_INSET}>
        <Title order={1} c="text-primary">{t`Permissions`}</Title>
      </Box>

      {/* The editor scrolls internally, so it needs a shrinkable flex child. */}
      <Box style={{ flex: 1, minHeight: 0 }}>
        <EmbeddingHubPermissionsBasePath />
      </Box>
    </Stack>
  );
}
