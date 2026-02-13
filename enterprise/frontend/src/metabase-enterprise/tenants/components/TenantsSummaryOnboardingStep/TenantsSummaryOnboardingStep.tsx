import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { RelatedSettingCard } from "metabase/admin/components/RelatedSettingsSection";
import { useDispatch } from "metabase/lib/redux";
import type { CreatedTenantData } from "metabase/plugins/oss/tenants";
import { Button, Flex, SimpleGrid, Stack, Text, Title } from "metabase/ui";

import { useListTenantsQuery } from "../../../api/tenants";

import { TenantSummaryCard } from "./TenantSummaryCard";

/**
 * If the user has reloaded the page, we fetch the
 * latest tenants to show as a fallback.
 */
const MAX_FETCHED_TENANTS_TO_SHOW = 3;

export const TenantsSummaryOnboardingStep = ({
  tenants,
}: {
  tenants: CreatedTenantData[];
}) => {
  const dispatch = useDispatch();

  const { data: tenantsData } = useListTenantsQuery(
    { status: "active" },
    { skip: tenants.length > 0 },
  );

  const onDone = () => dispatch(push("/admin/embedding/setup-guide"));

  const tenantsToShow = useMemo(() => {
    // If we have tenants from the flow, use them
    if (tenants.length > 0) {
      return tenants;
    }

    // Fallback to the last N tenants (most recently created are likely at the end)
    const lastTenants =
      tenantsData?.data?.slice(-MAX_FETCHED_TENANTS_TO_SHOW) ?? [];

    return lastTenants.map((tenant) => ({
      name: tenant.name,
      slug: tenant.slug,
      tenantIdentifier: tenant.attributes?.tenant_identifier ?? "",
    }));
  }, [tenants, tenantsData]);

  return (
    <Stack gap="lg">
      <Title order={3} c="text-primary">
        {t`You created the following tenants`}
      </Title>

      <Stack gap="md">
        {tenantsToShow.map((tenant) => (
          <TenantSummaryCard
            key={tenant.slug}
            name={tenant.name}
            tenantIdentifier={tenant.tenantIdentifier || null}
            slug={tenant.slug}
          />
        ))}
      </Stack>

      <Text c="text-secondary" lh="lg">
        {t`If you need to change these settings, you can go back to the previous steps, or configure more details in the following pages.`}
      </Text>

      <RelatedSettingsSection />

      <Flex justify="flex-end">
        <Button variant="filled" onClick={onDone}>
          {t`Done`}
        </Button>
      </Flex>
    </Stack>
  );
};

const RelatedSettingsSection = () => (
  <SimpleGrid cols={2} spacing="md">
    <RelatedSettingCard
      name={t`Tenants`}
      icon="globe"
      to="/admin/people/tenants"
    />

    <RelatedSettingCard
      name={t`People`}
      icon="person"
      to="/admin/people/tenants/people"
    />

    <RelatedSettingCard
      name={t`Authentication`}
      icon="lock"
      to="/admin/settings/authentication"
    />

    <RelatedSettingCard
      name={t`Permissions`}
      icon="group"
      to="/admin/permissions"
    />
  </SimpleGrid>
);
