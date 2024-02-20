import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useCollectionQuery, useTableQuery } from "metabase/common/hooks";
import { useSelector, useDispatch } from "metabase/lib/redux";
import { isUploadAborted, isUploadInProgress } from "metabase/lib/uploads";
import { isEmpty } from "metabase/lib/validate";
import { getAllUploads, clearAllUploads } from "metabase/redux/uploads";
import type { CollectionId, TableId } from "metabase-types/api";
import type { FileUpload } from "metabase-types/store/upload";

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

  const { isLoading: tableLoading, data: table } = useTableQuery({
    id: tableId,
    enabled: !isEmpty(tableId),
  });
  const { isLoading: collectionLoading, data: collection } = useCollectionQuery(
    { id: collectionId, enabled: !isEmpty(collectionId) },
  );

  const isLoading = !!(tableLoading || collectionLoading);
  const hasData = !!(table || collection);

  if (!isVisible || (isLoading && !hasData)) {
    return null;
  }

  const uploadDestination = table ?? collection;

  if (!uploadDestination) {
    return null;
  }

  return (
    <ErrorBoundary>
      <FileUploadStatusLarge
        uploads={uploads}
        resetUploads={resetUploads}
        uploadDestination={uploadDestination}
      />
    </ErrorBoundary>
  );
};
