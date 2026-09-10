import { t } from "ttag";

import { GroupsListingApp } from "metabase/admin/people/containers/GroupsListingApp";
import { isEmbeddingHubTenancy } from "metabase/common/tenants";

export const ExternalGroupsListingApp = () => {
  // The hub's Tenancy tab already names this page above the sub-tabs.
  const isEmbeddingHub = isEmbeddingHubTenancy();

  return (
    <GroupsListingApp
      description={t`Use tenant groups to manage access for tenant users. Every tenant has access to these groups.`}
      external
      showTitle={!isEmbeddingHub}
    />
  );
};
