import React from "react";
import { t } from "ttag";
import { Link } from "metabase/core/components/Link";
import { Collection } from "metabase-types/api";
import { FileUpload } from "metabase-types/store/upload";

import {
  isUploadInProgress,
  isUploadCompleted,
  isUploadAborted,
} from "metabase/lib/uploads";

import StatusLarge from "../StatusLarge";

export interface FileUploadLargeProps {
  collection: Collection;
  uploads: FileUpload[];
  isActive?: boolean;
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
      title: getName(upload),
      icon: "model",
      description: getDescription(upload),
      isInProgress: isUploadInProgress(upload),
      isCompleted: isUploadCompleted(upload),
      isAborted: isUploadAborted(upload),
    })),
  };

  return <StatusLarge status={status} isActive={isActive} />;
};

const getName = (upload: FileUpload) => {
  if (upload.status === "complete") {
    return <Link to={`/model/${upload.modelId}`}>{upload.name}</Link>;
  }
  return upload.name;
};

const getTitle = (uploads: FileUpload[], collection: Collection) => {
  const isDone = uploads.every(isUploadCompleted);
  const isError = uploads.some(isUploadAborted);

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FileUploadLarge;
