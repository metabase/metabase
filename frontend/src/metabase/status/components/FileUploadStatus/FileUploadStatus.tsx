import _ from "underscore";

import { useAsync } from "react-use";
import ErrorBoundary from "metabase/ErrorBoundary";
import { useSelector, useDispatch } from "metabase/lib/redux";
import { getAllUploads, clearAllUploads } from "metabase/redux/uploads";
import type { CollectionId, TableId } from "metabase-types/api";
import type { FileUpload } from "metabase-types/store/upload";
import { isUploadAborted, isUploadInProgress } from "metabase/lib/uploads";
import { MetabaseApi, CollectionsApi } from "metabase/services";

import useStatusVisibility from "../../hooks/use-status-visibility";
import FileUploadStatusLarge from "../FileUploadStatusLarge";

export const FileUploadStatus = () => {
  const uploads = useSelector(getAllUploads);
  const dispatch = useDispatch();
  const resetUploads = () => dispatch(clearAllUploads());

  const groupedTables = _.groupBy(
    uploads.filter(upload => upload.tableId),
    "tableId",
  );
  const groupedCollections = _.groupBy(
    uploads.filter(upload => upload.collectionId),
    "collectionId",
  );

  const tables = Object.keys(groupedTables) as TableId[];
  const collections = Object.keys(groupedCollections) as CollectionId[];

  return (
    <>
      {tables.map(tableId => {
        return (
          <FileUploadStatusContent
            key={`uploads-table-${tableId}`}
            uploads={groupedTables[tableId]}
            resetUploads={resetUploads}
            tableId={tableId}
          />
        );
      })}
      {collections.map(collectionId => {
        return (
          <FileUploadStatusContent
            key={`uploads-collection-${collectionId}`}
            uploads={groupedCollections[collectionId]}
            resetUploads={resetUploads}
            collectionId={collectionId}
          />
        );
      })}
    </>
  );
};

const FileUploadStatusContent = ({
  collectionId,
  tableId,
  uploads,
  resetUploads,
}: {
  collectionId?: CollectionId;
  tableId?: TableId;
  uploads: FileUpload[];
  resetUploads: () => void;
}) => {
  const isActive = uploads.some(
    upload => isUploadInProgress(upload) || isUploadAborted(upload),
  );
  const isVisible = useStatusVisibility(isActive);

  const { value: entityInfo, loading } = useAsync(async () => {
    if (tableId) {
      const table = await MetabaseApi.table_get({ tableId: tableId });
      return table;
    }

    if (collectionId) {
      const collection = await CollectionsApi.get({ id: collectionId });
      return collection;
    }
  });

  if (!isVisible || loading || !entityInfo) {
    return null;
  }

  return (
    <ErrorBoundary>
      <FileUploadStatusLarge
        uploads={uploads}
        resetUploads={resetUploads}
        uploadDestination={entityInfo}
      />
    </ErrorBoundary>
  );
};
