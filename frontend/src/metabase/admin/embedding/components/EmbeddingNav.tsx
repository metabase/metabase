import { t } from "ttag";

import {
  AdminNavItem,
  type AdminNavItemProps,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import { Divider, Flex, Stack } from "metabase/ui";

export function EmbeddingNav() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const hasInteractiveEmbedding = PLUGIN_EMBEDDING.isEnabled();
  const hasSdkEmbedding = useHasTokenFeature("embedding_sdk");

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
          path="/admin/embedding/modular"
          label={
            <Flex gap="sm" align="center">
              <span>{t`Modular`}</span>
              {(!hasSdkEmbedding || !hasSimpleEmbedding) && <UpsellGem />}
            </Flex>
          }
          icon="embed_modular"
        />

        <EmbeddingNavItem
          path="/admin/embedding/interactive"
          label={
            <Flex gap="sm" align="center">
              <span>{t`Interactive`}</span>
              {!hasInteractiveEmbedding && <UpsellGem />}
            </Flex>
          }
          icon="embed_interactive"
        />

        <EmbeddingNavItem
          path="/admin/embedding/static"
          label={t`Static`}
          icon="embed_static"
        />
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
