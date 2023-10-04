import { useSelector, useDispatch } from "metabase/lib/redux";
import { getAllUploads, clearAllUploads } from "metabase/redux/uploads";
import Collections from "metabase/entities/collections/collections";
import type { Collection } from "metabase-types/api";
import type { FileUpload } from "metabase-types/store/upload";
import { isUploadAborted, isUploadInProgress } from "metabase/lib/uploads";

import useStatusVisibility from "../../hooks/use-status-visibility";
import FileUploadStatusLarge from "../FileUploadStatusLarge";

const FileUploadStatus = ({
  collections = [],
}: {
  collections: Collection[];
}) => {
  const uploads = useSelector(getAllUploads);
  const dispatch = useDispatch();
  const resetUploads = () => dispatch(clearAllUploads());

  const uploadCollections = collections.filter(collection =>
    uploads.some(upload => upload.collectionId === collection.id),
  );

  return (
    <>
      {uploadCollections.map(collection => {
        const collectionUploads = uploads.filter(
          ({ collectionId }) => collectionId === collection.id,
        );

        return (
          <FileUploadStatusContent
            key={`uploads-${collection.id}`}
            uploads={collectionUploads}
            resetUploads={resetUploads}
            collection={collection}
          />
        );
      })}
    </>
  );
};

const FileUploadStatusContent = ({
  collection,
  uploads,
  resetUploads,
}: {
  collection: Collection;
  uploads: FileUpload[];
  resetUploads: () => void;
}) => {
  const isActive = uploads.some(
    upload => isUploadInProgress(upload) || isUploadAborted(upload),
  );
  const isVisible = useStatusVisibility(isActive);

  if (!isVisible) {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Collections.loadList({ loadingAndErrorWrapper: false })(
  FileUploadStatus,
);
