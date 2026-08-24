import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  ACTIVE_STATUS,
  type ActiveStatus,
} from "metabase/admin/people/constants";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { Outlet } from "metabase/router";
import { SettingsSection } from "metabase/settings-components/SettingsSection";
import { Box, Group, Tabs, Title } from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";

import { EditUserStrategySettingsButton } from "../EditUserStrategySettingsButton";
import { TenantsDocsButton } from "../TenantsDocsButton";
import { TenantsListing } from "../components/TenantsListing";

export const TenantsListingApp = () => {
  const isAdmin = useSelector(getUserIsAdmin);

  const [searchInputValue, setSearchInputValue] = useState("");
  const [status, setStatus] = useState<ActiveStatus>(ACTIVE_STATUS.active);

  const { isLoading, error, data } = useListTenantsQuery({ status: "all" });

  const tenants = useMemo(
    () =>
      data?.data.filter((tenant) =>
        status === ACTIVE_STATUS.active ? tenant.is_active : !tenant.is_active,
      ) ?? [],
    [data?.data, status],
  );

  const hasDeactivatedTenants = useMemo(
    () => data?.data.some((tenant) => !tenant.is_active),
    [data?.data],
  );

  const handleTabChange = (tab: ActiveStatus | null) => {
    if (tab) {
      setStatus(tab);
    }
  };

  useEffect(() => {
    if (!hasDeactivatedTenants) {
      setStatus("active");
    }
  }, [hasDeactivatedTenants]);

  const hasNoTenants = data?.data?.length === 0;

  return (
    // Narrower when there are no tenants. 50rem matches the embedding hub's
    // content column, which mounts this same listing.
    <Box maw={hasNoTenants ? "50rem" : undefined} mx="auto">
      <Group justify="space-between" w="100%" mb="xl">
        <Title order={1}>{t`Tenants`}</Title>

        <Group gap="sm">
          <TenantsDocsButton />
          <EditUserStrategySettingsButton page="tenants" />
        </Group>
      </Group>

      {isAdmin && hasDeactivatedTenants && (
        <Tabs
          value={status}
          onChange={handleTabChange}
          pl="lg"
          listBorder={false}
        >
          <Tabs.List>
            <Tabs.Tab value={ACTIVE_STATUS.active}>{t`Active`}</Tabs.Tab>

            <Tabs.Tab
              value={ACTIVE_STATUS.deactivated}
            >{t`Deactivated`}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      )}

      <SettingsSection>
        <LoadingAndErrorWrapper error={error} loading={isLoading}>
          <TenantsListing
            isAdmin={isAdmin}
            tenants={tenants}
            searchInputValue={searchInputValue}
            setSearchInputValue={setSearchInputValue}
            status={status}
            hasNoTenants={hasNoTenants}
          />
        </LoadingAndErrorWrapper>

        <Outlet />
      </SettingsSection>
    </Box>
  );
};
