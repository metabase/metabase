import { useEffect, useState } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import {
  resetPermissionsBasePath,
  setPermissionsBasePath,
} from "metabase/admin/permissions/utils/base-path";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import {
  resetTenantsBasePath,
  setTenantsBasePath,
} from "metabase/common/tenants";
import { isUnder } from "metabase/embedding-hub/components/EmbeddingHubLayout";
import { TenancyUpsellPage } from "metabase/embedding-hub/upsells";
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
 * fragment. Branches on license and the setting itself rather than reusing
 * `createTenantsRouteGuard`: that guard redirects the licensed-but-disabled
 * state to `/admin/people`, but here the tab that leads to it is always
 * clickable, so that state renders in place instead.
 */
export function EmbeddingHubTenancyPage() {
  const hasTenants = useHasTokenFeature("tenants");
  const isUsingTenants = useSetting("use-tenants");

  // Declares the hub as both the tenant and the permissions editor's URL
  // builders' host, the same way EmbeddingHubPermissionsBasePath does when the
  // Permissions tab itself is mounted.
  setTenantsBasePath(Urls.embeddingHubTenancy());
  setPermissionsBasePath(Urls.embeddingHubPermissions());
  useEffect(() => {
    return () => {
      resetTenantsBasePath();
      resetPermissionsBasePath();
    };
  }, []);

  if (!hasTenants) {
    return <TenancyUpsellPage />;
  }

  return (
    <SettingsPageWrapper title={t`Tenancy`}>
      {!isUsingTenants && <EnableTenancyCard />}

      {isUsingTenants && (
        <>
          <TenancyTabs />

          {/* The listing centres itself with `mx="auto"`, which as a flex
              item collapses it to its content width. */}
          <Box w="100%">
            <Outlet />
          </Box>
        </>
      )}
    </SettingsPageWrapper>
  );
}

function TenancyTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tenancyBasePath = Urls.embeddingHubTenancy();

  const tabs = [
    { label: t`Tenants`, to: tenancyBasePath },
    { label: t`Tenant groups`, to: `${tenancyBasePath}/groups` },
    { label: t`Tenant users`, to: `${tenancyBasePath}/people` },
  ];

  // The listing also renders at /:tenantId, so anything that is not groups or
  // users belongs to the Tenants tab.
  const activeTab =
    tabs.find((tab) => tab.to !== tenancyBasePath && isUnder(pathname, tab.to))
      ?.to ?? tenancyBasePath;

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
    <Card p="xxl" withBorder>
      <Flex gap="xxl" align="center" justify="space-between" wrap="nowrap">
        <Stack gap="lg" maw="30rem">
          <Title order={4}>{t`Enable multi-tenant user strategy`}</Title>

          <Text c="text-secondary" lh="lg">
            {t`A tenant is a set of attributes assigned to a user to isolate them from other tenants. For example, in a SaaS app with embedded Metabase dashboards, you can assign each customer to a tenant. Tenants let you reuse the same dashboards and permissions across all tenants, instead of recreating them for each customer.`}
          </Text>

          <Group gap="xl">
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
          shadow="sm"
          withBorder
          maw="40%"
          visibleFrom="md"
        >
          <Center w="100%" p="xxl">
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
        <Icon name="external" size={12} c="brand" aria-hidden />
      </Group>
    </ExternalLink>
  );
}
