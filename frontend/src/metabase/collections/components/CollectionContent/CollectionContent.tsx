import {
  useGetCollectionQuery,
  useListBookmarksQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDatabaseListQuery } from "metabase/common/hooks";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getSetting } from "metabase/settings";
import type { CollectionId } from "metabase-types/api";

import { CollectionContentView } from "./CollectionContentView";

export function CollectionContent({
  collectionId,
}: {
  collectionId: CollectionId;
}) {
  const { data: bookmarks, error: bookmarksError } = useListBookmarksQuery();
  const { data: databases, error: databasesError } = useDatabaseListQuery();

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

  const canCreateUploadInDb = useSelector(
    (state) =>
      uploadDbId != null &&
      !!getMetadata(state).database(uploadDbId)?.canUpload(),
  );

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
