import { t } from "ttag";

import { PermissionsBasePath } from "metabase/admin/permissions/components/PermissionsBasePath";
import { Box, Stack, Title } from "metabase/ui";
import * as Urls from "metabase/urls";

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
    // White, like admin: the editor is a working surface, not a settings page
    // sitting on the hub's tinted background.
    <Stack gap="md" h="100%" pt="1.5rem" bg="background_page-primary">
      {/* The page is full-width, so it gets no padding from AreaContent and
          has to place its own. The title is not decoration: without it the
          editor's tab row starts at the top of the area, where "Permissions
          help" sits under the app switcher.

          Aligned with the tab labels below it rather than with the other hub
          pages' CONTENT_PADDING_X: the editor insets its tab list by `xl`
          (2rem, PermissionsTabs.tsx) and each tab adds 0.5rem of its own
          (Tab.module.css). */}
      <Box pl={TAB_LABEL_INSET}>
        <Title order={1} c="text-primary">{t`Permissions`}</Title>
      </Box>

      {/* The editor is `height: 100%` with its own internal scrolling, so it
          needs a flex child that can shrink rather than the full area.

          Deliberately no right inset. Lining "Permissions help" up with the
          app switcher would mean padding the editor, and the editor scrolls
          internally, so the padding sits outside the scroller and reads wrong
          as soon as the content moves. Its own toolbar padding is the
          compromise. */}
      <Box style={{ flex: 1, minHeight: 0 }}>
        <PermissionsBasePath basePath={Urls.embeddingHubPermissions()} />
      </Box>
    </Stack>
  );
}
