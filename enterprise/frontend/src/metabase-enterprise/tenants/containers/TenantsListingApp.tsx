import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  ACTIVE_STATUS,
  type ActiveStatus,
} from "metabase/admin/people/constants";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Group, Tabs, Title } from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";

import { EditUserStrategySettingsButton } from "../EditUserStrategySettingsButton";
import { TenantsListing } from "../components/TenantsListing";
import { TenantsListingEmptyState } from "../components/TenantsListingEmptyState";

import S from "./TenantsListingApp.module.css";

export const TenantsListingApp = ({
  children,
}: {
  children: React.ReactNode;
}) => {
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

  const hasNoTenants = data?.data?.length === 0;

  const handleTabChange = (tab: string | null) => {
    if (tab) {
      setStatus(tab as ActiveStatus);
    }
  };

  useEffect(() => {
    if (!hasDeactivatedTenants) {
      setStatus("active");
    }
  }, [hasDeactivatedTenants]);

  return (
    <Box maw={hasNoTenants ? "700px" : undefined} mx="auto">
      <Group justify="space-between" w="100%" mb="lg">
        <Title order={1}>{t`Tenants`}</Title>

        <Group gap="sm">
          <EditUserStrategySettingsButton page="tenants" />
        </Group>
      </Group>

      {isAdmin && hasDeactivatedTenants && (
        <Tabs value={status} onChange={handleTabChange} pl="md">
          <Tabs.List className={S.tabs}>
            <Tabs.Tab value={ACTIVE_STATUS.active}>{t`Active`}</Tabs.Tab>

            <Tabs.Tab
              value={ACTIVE_STATUS.deactivated}
            >{t`Deactivated`}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      )}

      <SettingsSection>
        <LoadingAndErrorWrapper error={error} loading={isLoading}>
          {hasNoTenants ? (
            <TenantsListingEmptyState onCreateTenant={() => {}} />
          ) : (
            <TenantsListing
              isAdmin={isAdmin}
              tenants={tenants}
              searchInputValue={searchInputValue}
              setSearchInputValue={setSearchInputValue}
              status={status}
            />
          )}
        </LoadingAndErrorWrapper>

        {children}
      </SettingsSection>
    </Box>
  );
};
