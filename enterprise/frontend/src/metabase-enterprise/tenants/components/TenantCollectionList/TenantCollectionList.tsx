import { t } from "ttag";

import { CollectionListView } from "metabase/common/components/CollectionListView";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";

export const TenantCollectionList = () => {
  const { data, isLoading } = useListTenantsQuery({ status: "active" });

  const tenants = data?.data ?? [];

  const crumbs = [
    {
      title: ROOT_COLLECTION.name,
      to: Urls.collection({ id: "root", name: "" }),
    },
    { title: t`Tenant collections` },
  ];

  const items = tenants
    .filter((tenant) => tenant.tenant_collection_id)
    .map((tenant) => ({
      key: tenant.id,
      name: tenant.name,
      icon: "folder" as const satisfies IconName,
      link: `/collection/${tenant.tenant_collection_id}`,
    }));

  return (
    <CollectionListView crumbs={crumbs} loading={isLoading} items={items} />
  );
};
