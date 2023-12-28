import _ from "underscore";

import { useSelector, useDispatch } from "metabase/lib/redux";
import { getAllUploads, clearAllUploads } from "metabase/redux/uploads";
import type { CollectionId } from "metabase-types/api";
import type { FileUpload } from "metabase-types/store/upload";
import { isUploadAborted, isUploadInProgress } from "metabase/lib/uploads";

import { useCollectionQuery } from "metabase/common/hooks";
import useStatusVisibility from "../../hooks/use-status-visibility";
import FileUploadStatusLarge from "../FileUploadStatusLarge";

export const FileUploadStatus = () => {
  const uploads = useSelector(getAllUploads);
  const dispatch = useDispatch();
  const resetUploads = () => dispatch(clearAllUploads());

  const groupedCollections = _.groupBy(uploads, "collectionId");

  const collections = Object.keys(groupedCollections) as CollectionId[];

  return (
    <>
      {collections.map(collectionId => {
        return (
          <FileUploadStatusContent
            key={`uploads-${collectionId}`}
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
  collectionId: CollectionId;
  uploads: FileUpload[];
  resetUploads: () => void;
}) => {
  const isActive = uploads.some(
    upload => isUploadInProgress(upload) || isUploadAborted(upload),
  );
  const isVisible = useStatusVisibility(isActive);

  const { data: collection, isLoading } = useCollectionQuery({
    id: collectionId,
  });

  if (!isVisible || isLoading || !collection) {
    return null;
  }

  return (
    <FileUploadStatusLarge
      uploads={uploads}
      resetUploads={resetUploads}
      collection={collection}
    />
  );
};
