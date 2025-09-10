import { t } from "ttag";

import {
  AdminNavItem,
  type AdminNavItemProps,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import { Divider, Flex, Stack } from "metabase/ui";

export function EmbeddingNav() {
  const hasEmbedding = useHasTokenFeature("embedding");

  return (
    <AdminNavWrapper>
      <Stack gap="xs">
        {hasEmbedding && (
          <>
            <EmbeddingNavItem
              path="/admin/embedding/setup-guide"
              data-testid="nav-item"
              label={t`Setup guide`}
              icon="list"
            />

            <Divider mb="sm" />
          </>
        )}

        <EmbeddingNavItem
          path="/admin/embedding/modular"
          data-testid="nav-item"
          label={
            <Flex gap="sm" align="center">
              <span>{t`Modular`}</span>
              {!hasEmbedding && <UpsellGem />}
            </Flex>
          }
          icon="embed_modular"
        />

        {hasEmbedding && (
          <EmbeddingNavItem
            path="/admin/embedding/interactive"
            data-testid="nav-item"
            label={t`Interactive`}
            icon="embed_interactive"
          />
        )}

        <EmbeddingNavItem
          path="/admin/embedding/static"
          data-testid="nav-item"
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
