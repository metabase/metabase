import { t } from "ttag";

import {
  STANDARD_USER_LIST_PAGE_SIZE as PAGE_SIZE,
  useListUsersQuery,
} from "metabase/api";
import { CollectionListView } from "metabase/common/components/CollectionListView";
import { usePagination } from "metabase/common/hooks/use-pagination";
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
  const { page, handleNextPage, handlePreviousPage } = usePagination();

  const { data: tenant } = useGetTenantQuery(tenantId);
  const { data, isLoading } = useListUsersQuery({
    tenant_id: tenantId,
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
  });

  const users = data?.data ?? [];
  const total = data?.total;

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
      key: user.personal_collection_id,
      name: user.common_name,
      icon: "person" as const satisfies IconName,
      link: `/collection/${user.personal_collection_id}`,
    }));

  return (
    <CollectionListView
      crumbs={crumbs}
      loading={isLoading}
      items={items}
      pagination={{
        page,
        pageSize: PAGE_SIZE,
        total,
        itemsLength: PAGE_SIZE,
        onNextPage: handleNextPage,
        onPreviousPage: handlePreviousPage,
      }}
    />
  );
};
