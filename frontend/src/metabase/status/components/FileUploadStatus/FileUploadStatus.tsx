import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { skipToken, useGetCollectionQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import type { FileUpload } from "metabase/redux/store/upload";
import { clearAllUploads, getAllUploads } from "metabase/redux/uploads";
import { isEmpty } from "metabase/utils/validate";
import type { CollectionId } from "metabase-types/api";

import useStatusVisibility from "../../hooks/use-status-visibility";
import { isUploadAborted, isUploadInProgress } from "../../utils";
import FileUploadStatusLarge from "../FileUploadStatusLarge";

export const FileUploadStatus = () => {
  const uploadsMap = useSelector(getAllUploads);
  const uploads = Object.values(uploadsMap);
  const dispatch = useDispatch();
  const resetUploads = () => dispatch(clearAllUploads());

  const groupedTables = _.groupBy(
    uploads.filter((upload) => upload.tableId),
    "tableId",
  );
  const groupedCollections = _.groupBy(
    uploads.filter((upload) => upload.collectionId),
    "collectionId",
  );

  // Unjustified type cast. FIXME
  const collections = Object.keys(groupedCollections) as CollectionId[];

  return (
    <>
      {Object.entries(groupedTables).map(([tableId, tableUploads]) => {
        return (
          <FileUploadStatusContent
            key={`uploads-table-${tableId}`}
            uploads={tableUploads}
            resetUploads={resetUploads}
          />
        );
      })}
      {collections.map((collectionId) => {
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
  uploads,
  resetUploads,
}: {
  collectionId?: CollectionId;
  uploads: FileUpload[];
  resetUploads: () => void;
}) => {
  const isActive = uploads.some(
    (upload) => isUploadInProgress(upload) || isUploadAborted(upload),
  );
  const isVisible = useStatusVisibility(isActive);

  // Table uploads carry their destination name in the upload itself, resolved
  // before the upload started. Collection uploads read it from the cache the
  // collection page already populated.
  const { isLoading: collectionLoading, data: collection } =
    useGetCollectionQuery(
      isEmpty(collectionId) ? skipToken : { id: collectionId },
    );

  const uploadDestinationName = uploads[0]?.tableName ?? collection?.name;

  if (!isVisible || (collectionLoading && !collection)) {
    return null;
  }

  if (!uploadDestinationName) {
    return null;
  }

  return (
    <ErrorBoundary>
      <FileUploadStatusLarge
        uploads={uploads}
        resetUploads={resetUploads}
        uploadDestinationName={uploadDestinationName}
      />
    </ErrorBoundary>
  );
};
