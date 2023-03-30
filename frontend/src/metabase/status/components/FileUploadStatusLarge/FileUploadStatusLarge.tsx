import React from "react";
import { t } from "ttag";
import Link from "metabase/core/components/Link";

import StatusLarge from "../StatusLarge";

export interface FileUploadLargeProps {
  isActive?: boolean;
  onCollapse?: () => void;
}

const FileUploadLarge = ({
  collection,
  uploads,
  onCollapse,
}: FileUploadLargeProps): JSX.Element => {
  const status = {
    title: getTitle(uploads, collection),
    items: uploads.map(upload => ({
      id: upload.id,
      title: upload.name,
      icon: "model",
      description: getDescription(upload),
      isInProgress: isSyncInProgress(upload),
      isCompleted: isSyncCompleted(upload),
      isAborted: isSyncAborted(upload),
    })),
  };

  return <StatusLarge status={status} onCollapse={onCollapse} />;
};

const getTitle = (uploads, collection) => {
  const isDone = uploads.every(isSyncCompleted);
  const isError = uploads.some(isSyncAborted);

  if (isDone) {
    return t`Data added to ${collection.name}`;
  } else if (isError) {
    return t`Error uploading your File`;
  } else {
    return t`Uploading data to ${collection.name}...`;
  }
};

const isSyncInProgress = upload => upload.status === "in-progress";

const isSyncCompleted = upload => upload.status === "complete";

const isSyncAborted = upload => upload.status === "error";

const getDescription = upload =>
  upload.status === "complete" ? <Link>Start exploring</Link> : "";

export default FileUploadLarge;
