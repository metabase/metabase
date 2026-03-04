import { t } from "ttag";

import { CollectionListView } from "metabase/common/components/CollectionListView";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";

export const TenantUsersList = () => {
  const { data, isLoading } = useListTenantsQuery({ status: "active" });

  const tenants = data?.data ?? [];

  const crumbs = [
    {
      title: ROOT_COLLECTION.name,
      to: Urls.collection({ id: "root", name: "" }),
    },
    { title: t`Tenant users' personal collections` },
  ];

  const items = tenants.map((tenant) => ({
    key: tenant.id,
    name: tenant.name,
    icon: "group" as const satisfies IconName,
    link: Urls.tenantUsersPersonalCollectionsForTenant(tenant.id),
  }));

  return (
    <CollectionListView crumbs={crumbs} loading={isLoading} items={items} />
  );
};
