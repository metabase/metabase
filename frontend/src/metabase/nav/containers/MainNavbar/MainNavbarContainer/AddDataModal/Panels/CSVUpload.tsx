import cx from "classnames";
import {
  type ChangeEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { c, t } from "ttag";

import { getComposedDragProps } from "metabase/collections/components/CollectionContent/utils";
import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import {
  type CollectionPickerItem,
  CollectionPickerModal,
} from "metabase/common/components/CollectionPicker";
import { UploadInput } from "metabase/components/upload";
import CollectionName from "metabase/containers/CollectionName";
import { useDispatch } from "metabase/lib/redux";
import {
  MAX_UPLOAD_SIZE,
  MAX_UPLOAD_STRING,
  uploadFile,
} from "metabase/redux/uploads";
import { Box, Button, Center, Group, Icon, Stack, Text } from "metabase/ui";
import { UploadMode } from "metabase-types/store/upload";

import S from "../AddDataModal.module.css";

import IconCSV from "./icons/csv.svg?component";
import IconCSVWarning from "./icons/csv_warning.svg?component";

export const CSVUpload = ({
  onCloseAddDataModal,
}: {
  onCloseAddDataModal: () => void;
}) => {
  const dispatch = useDispatch();
  const initialCollectionId = useGetDefaultCollectionId() ?? "root";

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);

  const [isCollectionPickerOpen, setIsCollectionPickerOpen] = useState(false);
  const [uploadCollectionId, setUploadCollectionId] =
    useState(initialCollectionId);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const triggerUploadInput = useCallback(
    () => uploadInputRef?.current?.click(),
    [],
  );

  const handleCollectionChange = useCallback((item: CollectionPickerItem) => {
    // The model should always be a collection since we explicitly set it in the CollectionPickerModal.
    // In case anything ever changes in the picker, we want to ignore it in this handler.
    if (item.model !== "collection") {
      return;
    }

    const { id } = item;
    if (typeof id === "number" || id === "root") {
      setUploadCollectionId(id);
      setIsCollectionPickerOpen(false);
    }
  }, []);

  const handleFileRejections = useCallback((rejected: FileRejection[]) => {
    if (!rejected.length) {
      return;
    }

    setUploadedFile(null);

    if (rejected.length > 1) {
      setFileUploadError(t`Please upload files individually`);
    }

    if (rejected.length === 1) {
      const [{ errors }] = rejected;
      const [{ code }] = errors;

      switch (code) {
        case "file-invalid-type":
          setFileUploadError(t`Sorry, this file type is not supported`);
          break;
        case "file-too-large":
          setFileUploadError(t`Sorry, this file is too large`);
          break;
        default:
          setFileUploadError("An error has occurred");
          break;
      }
    }
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (acceptedFiles.length === 1) {
        setFileUploadError(null);
        setUploadedFile(acceptedFiles[0]);
      }

      handleFileRejections(fileRejections);
    },
    [handleFileRejections],
  );

  const dropZoneConfig = useMemo(
    () => ({
      onDrop,
      maxFiles: 1,
      maxSize: MAX_UPLOAD_SIZE,
      noClick: true,
      noDragEventsBubbling: true,
      accept: { "text/csv": [".csv"], "text/tab-separated-values": [".tsv"] },
    }),
    [onDrop],
  );

  const { getRootProps, isDragActive } = useDropzone(dropZoneConfig);

  const dropzoneProps = getComposedDragProps(getRootProps());

  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      if (file.size > MAX_UPLOAD_SIZE) {
        setFileUploadError(t`Sorry, this file is too large`);
        return;
      }

      setFileUploadError(null);
      setUploadedFile(file);

      // reset the input so that the same file can be uploaded again
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    },
    [],
  );

  const handleFileUpload = useCallback(
    (uploadedFile: File | null) => {
      if (!uploadedFile) {
        return;
      }

      dispatch(
        uploadFile({
          uploadMode: UploadMode.create,
          collectionId: uploadCollectionId,
          file: uploadedFile,
        }),
      );

      setUploadedFile(null);
      onCloseAddDataModal();
    },
    [dispatch, onCloseAddDataModal, uploadCollectionId],
  );

  const primaryText = useMemo(() => {
    if (uploadedFile) {
      return uploadedFile.name;
    }

    if (fileUploadError) {
      return fileUploadError;
    }

    return t`Drag and drop a file here`;
  }, [uploadedFile, fileUploadError]);

  return (
    <>
      <Stack align="stretch" justify="space-between" h="100%" w="100%">
        <Center
          ta="center"
          {...dropzoneProps}
          className={cx(S.dropZone, isDragActive && S.isActive)}
          data-testid="add-data-modal-csv-dropzone"
        >
          <Stack gap="sm" align="center">
            {fileUploadError ? (
              <Box component={IconCSVWarning} h={50} />
            ) : (
              <Box
                c={uploadedFile ? "brand" : "text-secondary-inverse"}
                component={IconCSV}
                h={50}
              />
            )}

            <div>
              <Text fw={700}>{primaryText}</Text>
              {!uploadedFile && (
                <Text c="text-light">
                  {c("The allowed MB size of a file")
                    .t`.csv or .tsv files, ${MAX_UPLOAD_STRING} MB max`}
                </Text>
              )}
            </div>
            {uploadedFile ? (
              <Button
                variant="subtle"
                p={0}
                h="auto"
                onClick={() => setUploadedFile(null)}
              >
                {t`Remove`}
              </Button>
            ) : (
              <Button
                variant="subtle"
                p={0}
                h="auto"
                onClick={triggerUploadInput}
              >
                {t`Select a file`}
              </Button>
            )}
          </Stack>
        </Center>
        <Group>
          <Button
            onClick={() => setIsCollectionPickerOpen(true)}
            rightSection={<Icon name="chevrondown" />}
            styles={{
              inner: {
                justifyContent: "space-between",
              },
              root: { flex: 1 },
            }}
          >
            <Group gap="sm" flex={1}>
              <Icon name="folder" />
              <CollectionName id={uploadCollectionId} />
            </Group>
          </Button>
          <Button
            variant="filled"
            disabled={!uploadedFile}
            onClick={() => handleFileUpload(uploadedFile)}
          >
            {t`Upload`}
          </Button>
        </Group>

        <UploadInput
          id="add-data-modal-upload-csv-input"
          ref={uploadInputRef}
          onChange={handleFileInput}
        />
      </Stack>

      {isCollectionPickerOpen && (
        <CollectionPickerModal
          title={t`Select a collection`}
          value={{ id: uploadCollectionId, model: "collection" }}
          onChange={handleCollectionChange}
          onClose={() => setIsCollectionPickerOpen(false)}
          options={{
            showPersonalCollections: true,
            showRootCollection: true,
            showSearch: true,
            confirmButtonText: t`Select this collection`,
          }}
          models={["collection"]}
          recentFilter={(items) =>
            items.filter((item) => {
              return item.model !== "table" && item.can_write;
            })
          }
        />
      )}
    </>
  );
};
