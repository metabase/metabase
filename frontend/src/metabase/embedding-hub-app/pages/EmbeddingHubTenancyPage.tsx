import { t } from "ttag";

import { UpsellTenants } from "metabase/admin/upsells";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { TenantUrlsProvider } from "metabase/common/tenants";
import { Outlet } from "metabase/router";
import { useSetting } from "metabase/settings";
import { Button, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";

/**
 * The tenant surfaces from admin People, mounted a second time under the hub.
 * Admin People keeps its copy — this is a second view, not a move.
 *
 * The tab renders conditionally rather than reusing `createTenantsRouteGuard`:
 * that guard redirects to `/admin/people` when tenants are licensed but
 * `use-tenants` is still off, which is exactly the state a hub user reaches by
 * clicking a tab that is always visible.
 */
export function EmbeddingHubTenancyPage() {
  const hasTenants = useHasTokenFeature("tenants");
  const isUsingTenants = useSetting("use-tenants");

  if (!hasTenants) {
    return <UpsellTenants />;
  }

  if (!isUsingTenants) {
    return <EnableTenancyEmptyState />;
  }

  return (
    <TenantUrlsProvider basePath={Urls.embeddingHubTenancy()}>
      <Outlet />
    </TenantUrlsProvider>
  );
}

function EnableTenancyEmptyState() {
  return (
    <Stack align="center" gap="md" py="4rem" maw="30rem" mx="auto" ta="center">
      <Title order={2}>{t`Turn on tenancy`}</Title>
      <Text c="text-secondary">
        {t`Tenants let you give each of your customers their own isolated set of people, groups and content. Pick a user strategy to get started.`}
      </Text>
      <Button
        component={ForwardRefLink}
        to={`${Urls.embeddingHubTenancy()}/user-strategy`}
        variant="filled"
      >
        {t`Pick a user strategy`}
      </Button>
    </Stack>
  );
}
