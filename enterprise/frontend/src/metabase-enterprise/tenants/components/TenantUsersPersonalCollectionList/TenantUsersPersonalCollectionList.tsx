import { t } from "ttag";

import { useListUsersQuery } from "metabase/api";
import { CollectionListView } from "metabase/common/components/CollectionListView";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import { useGetTenantQuery } from "metabase-enterprise/api";

interface TenantUsersPersonalCollectionListProps {
  params: { tenantId: string };
}

export const TenantUsersPersonalCollectionList = ({
  params,
}: TenantUsersPersonalCollectionListProps) => {
  const tenantId = parseInt(params.tenantId, 10);

  const { data: tenant } = useGetTenantQuery(tenantId);
  const { data, isLoading } = useListUsersQuery({ tenant_id: tenantId });

  const users = data?.data ?? [];

  const crumbs = [
    {
      title: ROOT_COLLECTION.name,
      to: Urls.collection({ id: "root", name: "" }),
    },
    {
      title: t`Tenant users' personal collections`,
      to: Urls.tenantUsersPersonalCollections(),
    },
    { title: tenant?.name ?? "" },
  ];

  const items = users
    .filter((user) => user.personal_collection_id)
    .map((user) => ({
      key: user.id,
      name: user.common_name,
      icon: "person" as const satisfies IconName,
      link: Urls.collection({
        id: user.personal_collection_id,
        name: user.common_name,
      }),
    }));

  return (
    <CollectionListView crumbs={crumbs} loading={isLoading} items={items} />
  );
};
