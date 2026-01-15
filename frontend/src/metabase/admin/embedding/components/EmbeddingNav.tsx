import { t } from "ttag";

import {
  AdminNavItem,
  type AdminNavItemProps,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import { Divider, Flex, Stack } from "metabase/ui";

export function EmbeddingNav() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  return (
    <AdminNavWrapper>
      <Stack gap="xs">
        {hasSimpleEmbedding && (
          <>
            <EmbeddingNavItem
              path="/admin/embedding/setup-guide"
              label={t`Setup guide`}
              icon="list"
            />

            <Divider mb="sm" />
          </>
        )}

        <EmbeddingNavItem
          path="/admin/embedding"
          label={
            <Flex gap="sm" align="center">
              <span>{t`Settings`}</span>
            </Flex>
          }
          icon="gear"
        />

        {/* EE with non-starter plan has embedding settings on different pages */}
        {hasSimpleEmbedding && (
          <>
            <EmbeddingNavItem
              path="/admin/embedding/guest"
              label={t`Guest embeds`}
              icon="ghost"
            />

            <EmbeddingNavItem
              path="/admin/embedding/security"
              label={t`Security`}
              icon="shield_outline"
            />
          </>
        )}
      </Stack>
    </AdminNavWrapper>
  );
}

const EmbeddingNavItem = (props: AdminNavItemProps) => {
  const location = useSelector(getLocation);
  const subpath = location?.pathname;

  const isActive = props.path === subpath;

  return <AdminNavItem {...props} active={isActive} />;
};
