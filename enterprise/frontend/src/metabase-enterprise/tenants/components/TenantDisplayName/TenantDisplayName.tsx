import { t } from "ttag";

import { Loader } from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";
import type { Tenant } from "metabase-types/api";

export const TenantDisplayName = ({ id }: { id: Tenant["id"] }) => {
  const { data: tenants, isLoading } = useListTenantsQuery({
    status: "all",
  });

  if (isLoading || !tenants) {
    return <Loader />;
  }

  const currentTenant = tenants.data.find((tenants) => tenants.id === id);

  return <>{currentTenant?.name || t`Unknown tenant`}</>;
};
