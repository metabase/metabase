import React from "react";

import { useSelector } from "metabase/lib/redux";
import { getAllUploads } from "metabase/redux/uploads";
import Collections from "metabase/entities/collections/collections";
import { Collection } from "metabase-types/api";
import { FileUpload } from "metabase-types/store/upload";
import { isUploadInProgress } from "metabase/lib/uploads";

import useStatusVisibility from "../../hooks/use-status-visibility";
import FileUploadStatusLarge from "../FileUploadStatusLarge";

const FileUploadStatus = ({
  collections = [],
}: {
  collections: Collection[];
}) => {
  const uploads = useSelector(getAllUploads);

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
}: {
  collection: Collection;
  uploads: FileUpload[];
}) => {
  const isActive = uploads.some(isUploadInProgress);
  const isVisible = useStatusVisibility(isActive);

  if (!isVisible) {
    return null;
  }

  return <FileUploadStatusLarge uploads={uploads} collection={collection} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Collections.loadList({ loadingAndErrorWrapper: false })(
  FileUploadStatus,
);
