import { t } from "ttag";

import { ReactivateUserButton } from "metabase/admin/people/components/ReactivateUserButton";
import { useListTenantsQuery } from "metabase-enterprise/api";
import type { User } from "metabase-types/api";

export const ReactivateExternalUserButton = ({ user }: { user: User }) => {
  // This is set to all to avoid making another API request to the BE. <TenantDisplayName> should be
  // Making the same API request, so we can leverage the cached result
  const { data: tenants } = useListTenantsQuery({
    status: "all",
  });

  const userTenantIsActive = Boolean(
    tenants?.data.find((tenants) => tenants.id === user.tenant_id)?.is_active,
  );
  const tooltip = !userTenantIsActive
    ? t`Cannot reactivate users on a disabled tenant`
    : undefined;

  return (
    <ReactivateUserButton
      user={user}
      disabled={!userTenantIsActive}
      tooltipLabel={tooltip}
    />
  );
};
