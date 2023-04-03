import React from "react";
import { t } from "ttag";
import Link from "metabase/core/components/Link";
import { Collection } from "metabase-types/api";
import { FileUpload } from "metabase-types/store/upload";

import StatusLarge from "../StatusLarge";

export interface FileUploadLargeProps {
  collection: Collection;
  uploads: FileUpload[];
}

const FileUploadLarge = ({
  collection,
  uploads,
}: FileUploadLargeProps): JSX.Element => {
  const status = {
    title: getTitle(uploads, collection),
    items: uploads.map(upload => ({
      id: upload.id,
      title: upload.name,
      icon: "model",
      description: getDescription(upload),
      isInProgress: uploadInProgress(upload),
      isCompleted: uploadCompleted(upload),
      isAborted: uploadAborted(upload),
    })),
  };

  return <StatusLarge status={status} />;
};

const getTitle = (uploads: FileUpload[], collection: Collection) => {
  const isDone = uploads.every(uploadCompleted);
  const isError = uploads.some(uploadAborted);

  if (isDone) {
    return t`Data added to ${collection.name}`;
  } else if (isError) {
    return t`Error uploading your File`;
  } else {
    return t`Uploading data to ${collection.name}...`;
  }
};

const uploadInProgress = (upload: FileUpload) =>
  upload.status === "in-progress";

const uploadCompleted = (upload: FileUpload) => upload.status === "complete";

const uploadAborted = (upload: FileUpload) => upload.status === "error";

const getDescription = (upload: FileUpload) =>
  upload.status === "complete" ? <Link to="/">Start exploring</Link> : "";

export default FileUploadLarge;
