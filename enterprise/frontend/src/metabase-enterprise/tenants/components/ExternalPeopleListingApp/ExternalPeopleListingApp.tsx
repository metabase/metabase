import { t } from "ttag";

import { PeopleListingApp } from "metabase/admin/people/containers/PeopleListingApp";
import { useListTenantsQuery } from "metabase-enterprise/api";

export const ExternalPeopleListingApp = (props: React.PropsWithChildren) => {
  const { data: tenants } = useListTenantsQuery({
    status: "active",
  });

  const hasTenants = !!(tenants && tenants.data.length > 0);

  return (
    <PeopleListingApp
      {...props}
      external
      showInviteButton={hasTenants}
      noResultsMessage={
        !hasTenants
          ? t`Add your first tenant to add tenant users`
          : t`Invite tenant users or provision them via SSO`
      }
    />
  );
};
