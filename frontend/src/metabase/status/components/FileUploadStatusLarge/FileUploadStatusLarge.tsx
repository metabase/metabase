import React from "react";
import { t } from "ttag";
import Link from "metabase/core/components/Link";
import { Collection } from "metabase-types/api";
import { FileUpload } from "metabase-types/store/upload";

import {
  uploadInProgress,
  uploadCompleted,
  uploadAborted,
} from "metabase/lib/uploads";

import StatusLarge from "../StatusLarge";

export interface FileUploadLargeProps {
  collection: Collection;
  uploads: FileUpload[];
  isActive: boolean;
}

const FileUploadLarge = ({
  collection,
  uploads,
  isActive,
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

  return <StatusLarge status={status} isActive={isActive} />;
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

const getDescription = (upload: FileUpload) => {
  if (upload.status === "complete") {
    return <Link to={`/model/${upload.modelId}`}>Start exploring</Link>;
  } else if (upload.status === "error") {
    return upload.message;
  }
  return "";
};

export default FileUploadLarge;
