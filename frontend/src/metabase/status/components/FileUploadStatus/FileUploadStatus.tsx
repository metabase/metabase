import React from "react";
import _ from "underscore";
import { useSelector } from "react-redux";
import { getAllUploads } from "metabase/redux/uploads";
import Collections from "metabase/entities/collections/collections";

import useStatusVisibility from "../../hooks/use-status-visibility";
import FileUploadStatusLarge from "../FileUploadStatusLarge";
import { Collection } from "metabase-types/api";

const FileUploadStatus = ({ collections }: { collections: Collection[] }) => {
  const uploads = useSelector(getAllUploads);
  const isActive = uploads.some(uploadIsActive);
  const isVisible = useStatusVisibility(isActive);

  const groupedUploads = _.groupBy(uploads, "collectionId");

  console.log(Collections);

  if (isVisible) {
    return (
      <FileUploadStatusLarge uploads={uploads} collection={{ name: "temp" }} />
    );
  }

  return null;
};

const uploadIsActive = upload => upload.status !== "complete";

const getCollectionForUpload = (upload, collections: Collection[]) =>
  collections.find(collection => collection.id === upload.collectionId);

export default _.compose(
  Collections.loadList({ loadingAndErrorWrapper: false }),
)(FileUploadStatus);
