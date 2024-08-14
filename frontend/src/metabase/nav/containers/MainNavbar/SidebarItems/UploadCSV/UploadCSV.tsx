import type { ChangeEvent, ReactElement } from "react";
import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import {
  ModelUploadModal,
  type CollectionOrTableIdProps,
} from "metabase/collections/components/ModelUploadModal";
import type { OnFileUpload } from "metabase/collections/types";
import { UploadInput, UploadTooltip } from "metabase/components/upload";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch } from "metabase/lib/redux";
import { PaddedSidebarLink } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import type { UploadFileProps } from "metabase/redux/uploads";
import { uploadFile as uploadFileAction } from "metabase/redux/uploads";

import { trackButtonClicked } from "./analytics";
import type { IUploadCSVProps } from "./types";

export function UploadCSV({ collection }: IUploadCSVProps): ReactElement {
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

  const handleUploadFile = useCallback<OnFileUpload>(
    (props: CollectionOrTableIdProps) => {
      const { collectionId, tableId } = props;
      if (uploadedFile && (collectionId || tableId)) {
        closeModelUploadModal();
        uploadFile({
          file: uploadedFile,
          ...props,
        });
      }
    },
    [uploadFile, uploadedFile, closeModelUploadModal],
  );

  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    trackButtonClicked();

    const file = event.target.files?.[0];
    if (file !== undefined) {
      setUploadedFile(file);
      openModelUploadModal();

      // reset the input so that the same file can be uploaded again
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <UploadTooltip collection={collection}>
        <PaddedSidebarLink
          icon="upload"
          onClick={() => uploadInputRef.current?.click()}
          aria-label={t`Upload CSVs`}
        >
          {t`Upload CSVs`}
        </PaddedSidebarLink>
        <UploadInput ref={uploadInputRef} onChange={handleFileUpload} />
      </UploadTooltip>

      <ModelUploadModal
        collectionId={collection.id}
        opened={isModelUploadModalOpen}
        onClose={closeModelUploadModal}
        onUpload={handleUploadFile}
      />
    </>
  );
}
