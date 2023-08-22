import { useState } from "react";
import { useInterval } from "react-use";
import { t } from "ttag";
import { Box, Stack } from "metabase/ui";
import Link from "metabase/core/components/Link";
import Button from "metabase/core/components/Button";
import type { Collection } from "metabase-types/api";
import type { FileUpload } from "metabase-types/store/upload";

import {
  isUploadInProgress,
  isUploadCompleted,
  isUploadAborted,
} from "metabase/lib/uploads";

import StatusLarge from "../StatusLarge";
import { FileUploadErrorModal } from "./FileUploadErrorModal";

const UPLOAD_MESSAGE_UPDATE_INTERVAL = 30 * 1000;

export interface FileUploadLargeProps {
  collection: Collection;
  uploads: FileUpload[];
  resetUploads: () => void;
  isActive?: boolean;
}

const FileUploadLarge = ({
  collection,
  uploads,
  resetUploads,
  isActive,
}: FileUploadLargeProps) => {
  const [loadingTime, setLoadingTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );

  const hasError = uploads.some(isUploadAborted);
  const isLoading = uploads.some(isUploadInProgress);

  useInterval(
    () => {
      setLoadingTime(loadingTime + 1);
    },
    isLoading ? UPLOAD_MESSAGE_UPDATE_INTERVAL : null,
  ); // null pauses the timer

  const title =
    isLoading && loadingTime > 0
      ? getLoadingMessage(loadingTime)
      : getTitle(uploads, collection);

  const status = {
    title,
    items: uploads.map(upload => ({
      id: upload.id,
      title: getName(upload),
      icon: "model",
      description: Description({ upload, setErrorMessage }),
      isInProgress: isUploadInProgress(upload),
      isCompleted: isUploadCompleted(upload),
      isAborted: isUploadAborted(upload),
    })),
  };

  if (Object.keys(uploads).length === 0) {
    return null;
  }

  return (
    <>
      <StatusLarge
        status={status}
        isActive={isActive || hasError}
        onDismiss={hasError ? resetUploads : undefined}
      />
      {errorMessage && (
        <FileUploadErrorModal onClose={() => setErrorMessage(undefined)}>
          {String(errorMessage)}
        </FileUploadErrorModal>
      )}
    </>
  );
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
    return t`Uploading data to ${collection.name} …`;
  }
};

const loadingMessages = [
  t`Getting our ducks in a row`,
  t`Still working`,
  t`Arranging bits and bytes`,
  t`Doing the heavy lifting`,
  t`Pushing some pixels`,
];

const getLoadingMessage = (time: number) => {
  const index = time % loadingMessages.length;
  return `${loadingMessages[index]} …`;
};

const Description = ({
  upload,
  setErrorMessage,
}: {
  upload: FileUpload;
  setErrorMessage: (msg?: string) => void;
}) => {
  if (upload.status === "complete") {
    return <Link to={`/model/${upload.modelId}`}>Start exploring</Link>;
  }

  if (upload.status === "error") {
    return (
      <Stack align="start" spacing="xs">
        <Box>{upload.message}</Box>
        {upload.error && (
          <Button onClick={() => setErrorMessage(upload.error)} onlyText>
            {t`Show error details`}
          </Button>
        )}
      </Stack>
    );
  }

  return "";
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FileUploadLarge;
