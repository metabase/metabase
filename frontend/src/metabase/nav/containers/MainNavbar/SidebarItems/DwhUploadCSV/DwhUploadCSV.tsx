import { type ChangeEvent, useCallback, useRef, useState } from "react";
import { c } from "ttag";

import {
  type CollectionOrTableIdProps,
  ModelUploadModal,
} from "metabase/collections/components/ModelUploadModal";
import type { OnFileUpload } from "metabase/collections/types";
import { UploadInput } from "metabase/components/upload";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch } from "metabase/lib/redux";
import {
  type UploadFileProps,
  uploadFile as uploadFileAction,
} from "metabase/redux/uploads";
import { Box, Button, Icon } from "metabase/ui";

import { trackDWHUploadCSVClicked } from "./analytics";

export const DwhUploadCSV = () => {
  const [
    isModelUploadModalOpen,
    { turnOn: openModelUploadModal, turnOff: closeModelUploadModal },
  ] = useToggle(false);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const dispatch = useDispatch();
  const uploadFile = useCallback(
    ({ file, modelId, collectionId, tableId, uploadMode }: UploadFileProps) =>
      dispatch(
        uploadFileAction({ file, modelId, collectionId, tableId, uploadMode }),
      ),
    [dispatch],
  );

  const handleFileUpload = useCallback<OnFileUpload>(
    (uploadFileArgs: CollectionOrTableIdProps) => {
      const { collectionId, tableId } = uploadFileArgs;
      if (uploadedFile && (collectionId || tableId)) {
        closeModelUploadModal();
        uploadFile({
          file: uploadedFile,
          ...uploadFileArgs,
        });
      }
    },
    [uploadFile, uploadedFile, closeModelUploadModal],
  );

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    trackDWHUploadCSVClicked();
    const file = event.target.files?.[0];

    if (file) {
      setUploadedFile(file);
      openModelUploadModal();

      // reset the input so that the same file can be uploaded again
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    }
  };

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const triggerUploadInput = () => uploadInputRef.current?.click();

  return (
    <Box data-testid="dwh-upload-csv" mt="md" px="md">
      <Button
        color="brand"
        fullWidth={true}
        leftIcon={<Icon name="upload" />}
        onClick={triggerUploadInput}
        radius="xl"
        variant="outline"
      >
        {c("Text for a button that lets you upload a CSV file").t`Upload CSV`}
      </Button>
      <UploadInput
        id="dwh-upload-csv-input"
        ref={uploadInputRef}
        onChange={handleFileInput}
      />
      <ModelUploadModal
        collectionId="root"
        opened={isModelUploadModalOpen}
        onClose={closeModelUploadModal}
        onUpload={handleFileUpload}
      />
    </Box>
  );
};
