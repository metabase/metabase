import { useEffect } from "react";

import {
  useGetCollectionQuery,
  useListBookmarksQuery,
  useListCollectionsTreeQuery,
  useListDatabasesQuery,
} from "metabase/api";
import {
  getCollectionSketchHeader,
  updateCollectionSketch,
  useCollectionSketch,
} from "metabase/collections/collection-sketch";
import { isEditableCollection } from "metabase/common/collections/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { MeasuredSkeleton } from "metabase/common/components/Skeletons";
import { getUser, getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/settings";
import { Box } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import S from "./CollectionContent.module.css";
import { CollectionContentSample } from "./CollectionContentSample";
import { CollectionContentSkeleton } from "./CollectionContentSkeleton";
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
  const currentUser = useSelector(getUser);
  const sketch = useCollectionSketch(collectionId);

  useEffect(() => {
    if (collection) {
      updateCollectionSketch(
        collectionId,
        getCollectionSketchHeader(
          collection,
          isEditableCollection(collection, { currentUser }),
        ),
      );
    }
  }, [collection, collectionId, currentUser]);

  const error =
    bookmarksError || databasesError || collectionsError || collectionError;

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  const isLoading = !bookmarks || !databases || !collections || !collection;

  return (
    <Box className={S.page}>
      <MeasuredSkeleton
        loading={isLoading}
        alwaysFromSample
        classic={<CollectionContentSkeleton />}
      >
        {isLoading ? (
          <CollectionContentSample sketch={sketch} />
        ) : (
          <CollectionContentView
            databases={databases}
            bookmarks={bookmarks}
            collection={collection}
            collectionId={collectionId}
            isAdmin={isAdmin}
            uploadsEnabled={uploadsEnabled}
            canCreateUploadInDb={canCreateUploadInDb}
          />
        )}
      </MeasuredSkeleton>
    </Box>
  );
}
