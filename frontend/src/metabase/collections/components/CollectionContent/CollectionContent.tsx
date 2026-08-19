import {
  useGetCollectionQuery,
  useListBookmarksQuery,
  useListCollectionsTreeQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/settings";
import type { CollectionId } from "metabase-types/api";

import { CollectionContentView } from "./CollectionContentView";

export function CollectionContent({
  collectionId,
}: {
  collectionId: CollectionId;
}) {
  const { data: bookmarks, error: bookmarksError } = useListBookmarksQuery();
  const { data: databasesResponse, error: databasesError } =
    useListDatabasesQuery();
  const databases = databasesResponse?.data;

  const { data: collections, error: collectionsError } =
    useListCollectionsTreeQuery({
      "exclude-other-user-collections": true,
      "exclude-archived": true,
    });

  const { data: collection, error: collectionError } = useGetCollectionQuery({
    id: collectionId,
  });

  const uploadDbId = useSelector(
    (state) => getSetting(state, "uploads-settings")?.db_id,
  );
  const uploadsEnabled = !!uploadDbId;

  const canCreateUploadInDb = !!databases?.find(({ id }) => id === uploadDbId)
    ?.can_upload;

  const isAdmin = useSelector(getUserIsAdmin);

  const error =
    bookmarksError || databasesError || collectionsError || collectionError;

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (!bookmarks || !databases || !collections || !collection) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <CollectionContentView
      databases={databases}
      bookmarks={bookmarks}
      collection={collection}
      collectionId={collectionId}
      isAdmin={isAdmin}
      uploadsEnabled={uploadsEnabled}
      canCreateUploadInDb={canCreateUploadInDb}
    />
  );
}
