import { type ChangeEvent, useCallback, useRef, useState } from "react";
import { c, t } from "ttag";

import {
  type CollectionOrTableIdProps,
  ModelUploadModal,
} from "metabase/collections/components/ModelUploadModal";
import type { OnFileUpload } from "metabase/collections/types";
import { UploadInput } from "metabase/components/upload";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_UPLOAD_MANAGEMENT } from "metabase/plugins";
import {
  type UploadFileProps,
  uploadFile as uploadFileAction,
} from "metabase/redux/uploads";
import { Box, Button, Flex, Icon, Menu } from "metabase/ui";

import { trackDWHUploadCSVClicked } from "./analytics";

export const DwhUploadMenu = () => {
  const [
    isModelUploadModalOpen,
    { turnOn: openModelUploadModal, turnOff: closeModelUploadModal },
  ] = useToggle(false);

  const [
    isGsheetModalOpen,
    { turnOn: openGsheetModal, turnOff: closeGsheetModal },
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
    <Box data-testid="dwh-upload" mt="md" px="md">
      <Menu position="right">
        <Menu.Target>
          <Button
            fullWidth
            variant="outline"
            styles={{ label: { width: "100%" } }}
          >
            <Flex justify="space-between" w="100%">
              <span />
              <Flex>
                <Icon name="add_data" mr="sm" />
                <Box>{t`Add Data`}</Box>
              </Flex>
              {/* need this on the far-right */}
              <Icon name="chevrondown" ml="sm" />
            </Flex>
          </Button>
        </Menu.Target>
        <Menu.Dropdown miw="19rem">
          <Menu.Item
            fw="bold"
            leftSection={<Icon name="upload" />}
            onClick={triggerUploadInput}
          >
            {c("button label for uploading a CSV data file").t`Upload CSV`}
          </Menu.Item>
          <PLUGIN_UPLOAD_MANAGEMENT.GsheetMenuItem onClick={openGsheetModal} />
        </Menu.Dropdown>
      </Menu>
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
      <PLUGIN_UPLOAD_MANAGEMENT.GsheetConnectionModal
        isModalOpen={isGsheetModalOpen}
        onClose={closeGsheetModal}
        reconnect={true}
      />
    </Box>
  );
};
