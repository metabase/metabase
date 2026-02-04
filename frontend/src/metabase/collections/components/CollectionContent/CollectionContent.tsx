import { useCallback } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  useBookmarkListQuery,
  useCollectionQuery,
  useDatabaseListQuery,
} from "metabase/common/hooks";
import { Bookmarks } from "metabase/entities/bookmarks";
import { Databases } from "metabase/entities/databases";
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
import { isLibraryCollection } from "metabase/collections/utils";

export function CollectionContent({
  collectionId,
}: {
  collectionId: CollectionId;
}) {
  const { data: bookmarks, error: bookmarksError } = useBookmarkListQuery();
  const { data: databases, error: databasesError } = useDatabaseListQuery();

  const { data: collections, error: collectionsError } =
    useListCollectionsTreeQuery({
      "exclude-other-user-collections": true,
      "exclude-archived": true,
    });

  const { data: collection, error: collectionError } = useCollectionQuery({
    id: collectionId,
  });

  const uploadDbId = useSelector(
    (state) => getSetting(state, "uploads-settings")?.db_id,
  );
  const uploadsEnabled = !!uploadDbId;

  const canCreateUploadInDb = useSelector(
    (state) =>
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
    dispatch(Bookmarks.actions.create({ id, type }));
  const deleteBookmark = (id: BookmarkId, type: BookmarkType) =>
    dispatch(Bookmarks.actions.delete({ id, type }));

  const uploadFile = useCallback(
    ({ file, modelId, collectionId, tableId, uploadMode }: UploadFileProps) =>
      dispatch(
        uploadFileAction({ file, modelId, collectionId, tableId, uploadMode }),
      ),
    [dispatch],
  );

  const error =
    bookmarksError || databasesError || collectionsError || collectionError;

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (!bookmarks || !databases || !collections || !collection) {
    return <LoadingAndErrorWrapper loading />;
  }

  const isLibrary = isLibraryCollection(collection);
  const visibleColumns = isLibrary
    ? ["typeWithName", "name", "description", "dataStudioLink"]
    : undefined;

  console.log({ isLibrary, visibleColumns });

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
      visibleColumns={visibleColumns}
    />
  );
}
