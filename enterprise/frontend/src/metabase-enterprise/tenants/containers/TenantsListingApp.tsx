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
import { Group, Stack, Tabs, Title } from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";

import { CreateTenantCollectionButton } from "../components/CreateTenantCollectionButton";
import { TenantsListing } from "../components/TenantsListing";

import S from "./TenantsListingApp.module.css";

export const TenantsListingApp = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const [searchInputValue, setSearchInputValue] = useState("");
  const [status, setStatus] = useState<ActiveStatus>(ACTIVE_STATUS.active);

  const { isLoading, error, data } = useListTenantsQuery({ status });
  const tenants = useMemo(() => data?.data ?? [], [data]);

  const { data: deactivatedTenantsData } = useListTenantsQuery({
    status: "deactivated",
  });
  const hasDeactivatedTenants =
    deactivatedTenantsData && deactivatedTenantsData.data.length > 0;

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
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={1}>{t`Tenants`}</Title>

        <CreateTenantCollectionButton />
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
          <TenantsListing
            isAdmin={isAdmin}
            tenants={tenants}
            searchInputValue={searchInputValue}
            setSearchInputValue={setSearchInputValue}
            status={status}
          />
        </LoadingAndErrorWrapper>

        {children}
      </SettingsSection>
    </Stack>
  );
};
