import _ from "underscore";

import {
  useCollectionQuery,
  useCollectionListQuery,
  useDatabaseListQuery,
  useBookmarkListQuery,
} from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Bookmark from "metabase/entities/bookmarks";
import Databases from "metabase/entities/databases";
import { useSelector, useDispatch } from "metabase/lib/redux";
import type { UploadFileProps } from "metabase/redux/uploads";
import { uploadFile as uploadFileAction } from "metabase/redux/uploads";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import type {
  CollectionId,
  BookmarkId,
  BookmarkType,
} from "metabase-types/api";

import { CollectionContentView } from "./CollectionContentView";

// FIXME: collectionId can be a number up here but it is passed
// down to PinnedItemCard where it is passed as the first argument to createBookmark,
// which expects a string, not a number
export function CollectionContent({
  collectionId,
}: {
  collectionId: CollectionId;
}) {
  const { data: bookmarks, error: bookmarksError } = useBookmarkListQuery();
  const { data: databases, error: databasesError } = useDatabaseListQuery();
  const { data: collections, error: collectionsError } = useCollectionListQuery(
    {
      query: {
        tree: true,
        "exclude-other-user-collections": true,
        "exclude-archived": true,
      },
    },
  );
  const { data: collection, error: collectionError } = useCollectionQuery({
    id: collectionId,
  });

  const uploadDbId = useSelector(state =>
    getSetting(state, "uploads-database-id"),
  );
  const uploadsEnabled = useSelector(state =>
    getSetting(state, "uploads-enabled"),
  );

  const canUploadToDb = useSelector(
    state =>
      uploadDbId &&
      Databases.selectors
        .getObject(state, {
          entityId: uploadDbId,
        })
        ?.canUpload(),
  );

  const isAdmin = useSelector(getUserIsAdmin);
  const isNavbarOpen = useSelector(getIsNavbarOpen);

  const dispatch = useDispatch();

  const createBookmark = (id: BookmarkId, type: BookmarkType) =>
    dispatch(Bookmark.actions.create({ id, type }));
  const deleteBookmark = (id: BookmarkId, type: BookmarkType) =>
    dispatch(Bookmark.actions.delete({ id, type }));

  const uploadFile = ({
    file,
    modelId,
    collectionId,
    tableId,
    uploadMode,
  }: UploadFileProps) =>
    dispatch(
      uploadFileAction({ file, modelId, collectionId, tableId, uploadMode }),
    );

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
      collections={collections}
      collectionId={collectionId}
      createBookmark={createBookmark}
      deleteBookmark={deleteBookmark}
      isAdmin={isAdmin}
      isNavbarOpen={isNavbarOpen}
      uploadFile={uploadFile}
      uploadsEnabled={uploadsEnabled}
      canUploadToDb={canUploadToDb}
    />
  );
}
