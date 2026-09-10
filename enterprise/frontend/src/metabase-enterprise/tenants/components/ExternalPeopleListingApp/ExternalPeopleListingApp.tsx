import { t } from "ttag";

import { PeopleListingApp } from "metabase/admin/people/containers/PeopleListingApp";
import { isEmbeddingHubTenancy } from "metabase/common/tenants";
import { useListTenantsQuery } from "metabase-enterprise/api";

export const ExternalPeopleListingApp = (props: React.PropsWithChildren) => {
  const { data: tenants } = useListTenantsQuery({
    status: "active",
  });

  const hasTenants = !!(tenants && tenants.data.length > 0);

  // The hub's Tenancy tab already names this page above the sub-tabs.
  const isEmbeddingHub = isEmbeddingHubTenancy();

  return (
    <PeopleListingApp
      {...props}
      external
      showInviteButton={hasTenants}
      showTitle={!isEmbeddingHub}
      noResultsMessage={
        !hasTenants
          ? t`Add your first tenant to add tenant users`
          : t`Invite tenant users or provision them via SSO`
      }
    />
  );
};
