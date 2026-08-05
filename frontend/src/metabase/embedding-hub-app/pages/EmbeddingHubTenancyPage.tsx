import { t } from "ttag";

import { UpsellTenants } from "metabase/admin/upsells";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import { TenantUrlsProvider } from "metabase/common/tenants";
import { Outlet, useLocation, useNavigate } from "metabase/router";
import { useSetting } from "metabase/settings";
import {
  Button,
  Card,
  Group,
  Icon,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";

/**
 * The tenant surfaces from admin People, mounted a second time under the hub.
 * Admin People keeps its copy — this is a second view, not a move.
 *
 * The tab bar is the hub's own: in admin it comes from PeopleNav, which sits
 * outside the route fragment and so does not travel with it.
 *
 * The page renders conditionally rather than reusing `createTenantsRouteGuard`:
 * that guard redirects to `/admin/people` when tenants are licensed but
 * `use-tenants` is still off, which is exactly the state a hub user reaches by
 * clicking a tab that is always visible.
 */
export function EmbeddingHubTenancyPage() {
  const hasTenants = useHasTokenFeature("tenants");
  const isUsingTenants = useSetting("use-tenants");

  return (
    <Stack gap="xl">
      <Title order={1} c="text-primary">{t`Tenancy`}</Title>

      {!hasTenants && <UpsellTenants />}

      {hasTenants && !isUsingTenants && <EnableTenancyCard />}

      {hasTenants && isUsingTenants && (
        <TenantUrlsProvider basePath={Urls.embeddingHubTenancy()}>
          <TenancyTabs />

          <Outlet />
        </TenantUrlsProvider>
      )}
    </Stack>
  );
}

function TenancyTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const root = Urls.embeddingHubTenancy();

  const tabs = [
    { label: t`Tenants`, to: root },
    { label: t`Tenant groups`, to: `${root}/groups` },
    { label: t`Tenant users`, to: `${root}/people` },
  ];

  // The listing also renders at /:tenantId, so anything that is not groups or
  // users belongs to the Tenants tab.
  const activeTab =
    tabs.find((tab) => tab.to !== root && pathname.startsWith(tab.to))?.to ??
    root;

  return (
    <Group justify="space-between" align="center">
      <Tabs value={activeTab} onChange={(value) => value && navigate(value)}>
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.to} value={tab.to}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <TenantsDocsLink label={t`Documentation`} />
    </Group>
  );
}

function EnableTenancyCard() {
  return (
    <Card p="xl" withBorder>
      <Stack gap="md" maw="30rem">
        <Title order={4}>{t`Enable multi-tenant user strategy`}</Title>

        <Text c="text-secondary" lh="lg">
          {t`A tenant is a set of attributes assigned to a user to isolate them from other tenants. For example, in a SaaS app with embedded Metabase dashboards, you can assign each customer to a tenant. Tenants let reuse the same dashboards and permissions across all tenants, instead of recreating them for each customer.`}
        </Text>

        <Group gap="lg">
          <Button
            component={ForwardRefLink}
            to={`${Urls.embeddingHubTenancy()}/user-strategy`}
            variant="filled"
          >
            {t`Enable multi-tenancy`}
          </Button>

          <TenantsDocsLink label={t`View docs`} />
        </Group>
      </Stack>
    </Card>
  );
}

function TenantsDocsLink({ label }: { label: string }) {
  const { url } = useDocsUrl("embedding/tenants");

  return (
    <ExternalLink href={url}>
      <Group gap={4} wrap="nowrap">
        <Text c="brand" fw="bold">
          {label}
        </Text>
        <Icon name="external" size={12} c="brand" />
      </Group>
    </ExternalLink>
  );
}
