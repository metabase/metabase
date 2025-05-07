import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { ACTIVE_STATUS } from "metabase/admin/people/constants";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useListTenantsQuery } from "metabase-enterprise/api";

import { TenantsListing } from "../components/TenantsListing";

export const TenantsListingApp = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const [searchInputValue, setSearchInputValue] = useState("");
  const [status, setStatus] = useState(ACTIVE_STATUS.active);

  const { isLoading, error, data } = useListTenantsQuery({ status });
  const tenants = useMemo(() => data?.data ?? [], [data]);

  return (
    <SettingsPageWrapper title={t`Tenants`}>
      <SettingsSection>
        <LoadingAndErrorWrapper error={error} loading={isLoading}>
          <TenantsListing
            isAdmin={isAdmin}
            tenants={tenants}
            searchInputValue={searchInputValue}
            setSearchInputValue={setSearchInputValue}
            status={status}
            onStatusChange={setStatus}
          />
        </LoadingAndErrorWrapper>
        {children}
      </SettingsSection>{" "}
    </SettingsPageWrapper>
  );
};
