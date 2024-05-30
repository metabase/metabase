import {
  useBookmarkListQuery,
  useCollectionListQuery,
  useCollectionQuery,
  useDatabaseListQuery,
} from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Bookmark from "metabase/entities/bookmarks";
import Databases from "metabase/entities/databases";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { UploadFileProps } from "metabase/redux/uploads";
import { uploadFile as uploadFileAction } from "metabase/redux/uploads";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import type {
  BookmarkId,
  BookmarkType,
  CollectionId,
} from "metabase-types/api";

import { CollectionContentView } from "./CollectionContentView";

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

  const uploadDbId = useSelector(
    state => getSetting(state, "uploads-settings")?.db_id,
  );
  const uploadsEnabled = !!uploadDbId;

  const canCreateUploadInDb = useSelector(
    state =>
      uploadDbId &&
      Databases.selectors
        .getObject(state, {
          entityId: uploadDbId,
        })
        ?.canUpload(),
  );

  const isAdmin = useSelector(getUserIsAdmin);

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
      uploadFile={uploadFile}
      uploadsEnabled={uploadsEnabled}
      canCreateUploadInDb={canCreateUploadInDb}
    />
  );
}
