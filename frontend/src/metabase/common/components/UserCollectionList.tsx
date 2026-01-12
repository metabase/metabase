import { useListUsersQuery } from "metabase/api";
import { CollectionListView } from "metabase/common/components/CollectionListView";
import {
  PERSONAL_COLLECTIONS,
  ROOT_COLLECTION,
} from "metabase/entities/collections/constants";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";

export const UserCollectionList = () => {
  const { data, isLoading } = useListUsersQuery({});

  const users = data?.data ?? [];

  const crumbs = [
    {
      title: ROOT_COLLECTION.name,
      to: Urls.collection({ id: "root", name: "" }),
    },
    { title: PERSONAL_COLLECTIONS.name },
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
    <CollectionListView crumbs={crumbs} loading={isLoading} items={items} />
  );
};
