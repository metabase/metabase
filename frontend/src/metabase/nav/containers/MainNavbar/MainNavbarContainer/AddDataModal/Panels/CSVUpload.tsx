import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import {
  type ChangeEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { match } from "ts-pattern";
import { c, t } from "ttag";

import { getComposedDragProps } from "metabase/collections/components/CollectionContent/utils";
import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import { CollectionName } from "metabase/common/components/CollectionName";
import {
  type CollectionPickerItem,
  CollectionPickerModal,
} from "metabase/common/components/Pickers/CollectionPicker";
import { UploadInput } from "metabase/common/components/upload";
import { useDispatch } from "metabase/lib/redux";
import {
  MAX_UPLOAD_SIZE,
  MAX_UPLOAD_STRING,
  uploadFile,
} from "metabase/redux/uploads";
import { Box, Button, Center, Group, Icon, Stack, Text } from "metabase/ui";
import { UploadMode } from "metabase-types/store/upload";

import S from "../AddDataModal.module.css";
import { trackCSVFileInputSelect } from "../analytics";

import IconCSV from "./illustrations/csv.svg?component";
import IconCSVWarning from "./illustrations/csv_warning.svg?component";

type UploadState = {
  file: File | null;
  error: string | null;
};

export const CSVUpload = ({
  onCloseAddDataModal,
}: {
  onCloseAddDataModal: () => void;
}) => {
  const dispatch = useDispatch();
  const initialCollectionId = useGetDefaultCollectionId() ?? "root";

  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    error: null,
  });

  const [
    isCollectionPickerOpen,
    { open: openCollectionPicker, close: closeCollectionPicker },
  ] = useDisclosure(false);
  const [uploadCollectionId, setUploadCollectionId] =
    useState(initialCollectionId);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const triggerUploadInput = useCallback(
    () => uploadInputRef?.current?.click(),
    [],
  );

  const handleCollectionChange = useCallback(
    (item: CollectionPickerItem) => {
      // The model should always be a collection since we explicitly set it in the CollectionPickerModal.
      // In case anything ever changes in the picker, we want to ignore it in this handler.
      if (item.model !== "collection") {
        return;
      }

      const { id } = item;
      if (typeof id === "number" || id === "root") {
        setUploadCollectionId(id);
        closeCollectionPicker();
      }
    },
    [closeCollectionPicker],
  );

  const handleFileRejections = useCallback((rejected: FileRejection[]) => {
    if (!rejected.length) {
      return;
    }

    if (rejected.length > 1) {
      setUploadState({
        file: null,
        error: t`Please upload files individually`,
      });
    }

    if (rejected.length === 1) {
      const [{ errors }] = rejected;
      const [{ code }] = errors;

      match(code)
        .with("file-invalid-type", () =>
          setUploadState({
            file: null,
            error: t`Sorry, this file type is not supported`,
          }),
        )
        .with("file-too-large", () =>
          setUploadState({
            file: null,
            error: t`Sorry, this file is too large`,
          }),
        )
        .otherwise(() =>
          setUploadState({ file: null, error: t`An error has occurred` }),
        );
    }
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (acceptedFiles.length === 1) {
        setUploadState({ file: acceptedFiles[0], error: null });
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

  const handleFileSelectClick = () => {
    trackCSVFileInputSelect();
    triggerUploadInput();
  };

  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      if (file.size > MAX_UPLOAD_SIZE) {
        setUploadState({ file: null, error: t`Sorry, this file is too large` });
        return;
      }

      setUploadState({ file, error: null });

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

      setUploadState({ file: null, error: null });
      onCloseAddDataModal();
    },
    [dispatch, onCloseAddDataModal, uploadCollectionId],
  );

  const primaryText = useMemo(() => {
    if (uploadState.file) {
      return uploadState.file.name;
    }

    if (uploadState.error) {
      return uploadState.error;
    }

    return t`Drag and drop a file here`;
  }, [uploadState]);

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
            {uploadState.error ? (
              <Box component={IconCSVWarning} h={50} />
            ) : (
              <Box
                c={uploadState.file ? "brand" : "text-secondary-inverse"}
                component={IconCSV}
                h={50}
              />
            )}

            <div>
              <Text fw="bold">{primaryText}</Text>
              {!uploadState.file && (
                <Text c="text-tertiary">
                  {c("{0} is the allowed size of a file in MB")
                    .t`.csv or .tsv files, ${MAX_UPLOAD_STRING} MB max`}
                </Text>
              )}
            </div>
            {uploadState.file ? (
              <Button
                variant="subtle"
                p={0}
                h="auto"
                onClick={() => setUploadState({ file: null, error: null })}
              >
                {t`Remove`}
              </Button>
            ) : (
              <Button
                variant="subtle"
                p={0}
                h="auto"
                onClick={handleFileSelectClick}
              >
                {t`Select a file`}
              </Button>
            )}
          </Stack>
        </Center>
        <Group>
          <Button
            aria-label={t`Select a collection`}
            onClick={() => openCollectionPicker()}
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
            disabled={!uploadState.file}
            onClick={() => handleFileUpload(uploadState.file)}
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
          onClose={() => closeCollectionPicker()}
          options={{
            showPersonalCollections: true,
            showRootCollection: true,
            showSearch: true,
            confirmButtonText: t`Select this collection`,
          }}
          models={["collection"]}
          entityType="dataset"
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
