import { useListUsersQuery } from "metabase/api";
import {
  PERSONAL_COLLECTIONS,
  ROOT_COLLECTION,
} from "metabase/common/collections/constants";
import { CollectionListView } from "metabase/common/components/CollectionListView";
import * as Urls from "metabase/urls";
import type { CollectionId, IconName, User } from "metabase-types/api";

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
    .filter(
      (user): user is User & { personal_collection_id: CollectionId } =>
        !!user.personal_collection_id,
    )
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
