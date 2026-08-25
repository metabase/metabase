import { useEffect, useState } from "react";
import { t } from "ttag";

import { UpsellTenants } from "metabase/admin/upsells";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import {
  resetTenantsBasePath,
  setTenantsBasePath,
} from "metabase/common/tenants";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Outlet, useLocation, useNavigate } from "metabase/router";
import { useSetting } from "metabase/settings";
import {
  Box,
  Button,
  Card,
  Center,
  Flex,
  Group,
  Icon,
  Image,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";

const UTM_CAMPAIGN = "embedding-hub";
const UTM_CONTENT = "embedding-hub-tenancy-page";
const TENANTS_ILLUSTRATION = "app/assets/img/upsell-embedding-tenants.svg";

/**
 * A second view of admin People's tenant surfaces, not a move — admin keeps its
 * copy, including the tab bar, which comes from PeopleNav outside the route
 * fragment. The page branches on the license and the setting rather than reusing
 * `createTenantsRouteGuard`, which redirects to `/admin/people` when tenants are
 * licensed but `use-tenants` is off — the state a hub user lands in by clicking
 * a tab that is always visible.
 */
export function EmbeddingHubTenancyPage() {
  const hasTenants = useHasTokenFeature("tenants");
  const isUsingTenants = useSetting("use-tenants");

  // Declares the hub as the tenant URL builders' host, the same way
  // EmbeddingHubPermissionsBasePath does for the permissions editor.
  setTenantsBasePath(Urls.embeddingHubTenancy(), {
    permissionsPath: Urls.embeddingHubPermissions(),
  });
  useEffect(() => resetTenantsBasePath, []);

  return (
    <Stack gap="xl">
      <Title order={1} c="text-primary">{t`Tenancy`}</Title>

      {!hasTenants && <UpsellTenants />}

      {hasTenants && !isUsingTenants && <EnableTenancyCard />}

      {hasTenants && isUsingTenants && (
        <>
          <TenancyTabs />

          {/* The listing centres itself with `mx="auto"`, which as a flex
              item collapses it to its content width. */}
          <Box w="100%">
            <Outlet />
          </Box>
        </>
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
      <Tabs
        variant="pills"
        value={activeTab}
        onChange={(value) => value && navigate(value)}
      >
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
  const [isUserStrategyModalOpen, setIsUserStrategyModalOpen] = useState(false);

  return (
    <Card p="xl" withBorder>
      <Flex gap="xl" align="center" justify="space-between" wrap="nowrap">
        <Stack gap="md" maw="30rem">
          <Title order={4}>{t`Enable multi-tenant user strategy`}</Title>

          <Text c="text-secondary" lh="lg">
            {t`A tenant is a set of attributes assigned to a user to isolate them from other tenants. For example, in a SaaS app with embedded Metabase dashboards, you can assign each customer to a tenant. Tenants let you reuse the same dashboards and permissions across all tenants, instead of recreating them for each customer.`}
          </Text>

          <Group gap="lg">
            {/* Opened here rather than routed to: the `.../user-strategy`
                modal route hangs off the tenants listing, which this page does
                not render until tenancy is on. */}
            <Button
              variant="filled"
              onClick={() => setIsUserStrategyModalOpen(true)}
            >
              {t`Enable multi-tenancy`}
            </Button>

            {isUserStrategyModalOpen && (
              <PLUGIN_TENANTS.EditUserStrategyModal
                onClose={() => setIsUserStrategyModalOpen(false)}
              />
            )}

            <TenantsDocsLink label={t`View docs`} />
          </Group>
        </Stack>

        {/* The same artwork the upsell shows, since this is the same subject
            one step further on. */}
        <Card
          p={6}
          radius={12}
          shadow="md"
          withBorder
          maw="40%"
          visibleFrom="md"
        >
          <Center w="100%" p="xl">
            <Image src={TENANTS_ILLUSTRATION} w="100%" h="auto" alt="" />
          </Center>
        </Card>
      </Flex>
    </Card>
  );
}

function TenantsDocsLink({ label }: { label: string }) {
  const { url } = useDocsUrl("embedding/tenants", {
    utm: {
      utm_source: "product",
      utm_medium: "docs",
      utm_campaign: UTM_CAMPAIGN,
      utm_content: UTM_CONTENT,
    },
  });

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
