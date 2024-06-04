import type { ChangeEvent, ReactNode, ReactElement } from "react";
import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import {
  ModelUploadModal,
  type CollectionOrTableIdProps,
} from "metabase/collections/components/ModelUploadModal";
import type { OnFileUpload } from "metabase/collections/types";
import Tooltip, {
  TooltipContainer,
  TooltipTitle,
  TooltipSubtitle,
} from "metabase/core/components/Tooltip";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch } from "metabase/lib/redux";
import { PaddedSidebarLink } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import type { UploadFileProps } from "metabase/redux/uploads";
import {
  MAX_UPLOAD_STRING,
  uploadFile as uploadFileAction,
} from "metabase/redux/uploads";
import type { Collection } from "metabase-types/api";

import { UploadInput } from "./UploadCSV.styled";
import type { IUploadCSVProps } from "./types";

const UPLOAD_FILE_TYPES = [".csv", ".tsv"];

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function UploadCSV({
  collection,
}: IUploadCSVProps): ReactElement {
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
    const file = event.target.files?.[0];
    if (file !== undefined) {
      saveFile(file);

      // reset the input so that the same file can be uploaded again
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    }
  };

  const saveFile = (file: File) => {
    setUploadedFile(file);
    openModelUploadModal();
  };

  return (
    <>
      <UploadTooltip collection={collection}>
        <PaddedSidebarLink
          icon="upload"
          onClick={() => uploadInputRef.current?.click()}
          aria-label={t`Upload CSV`}
        >
          {t`Upload CSV`}
        </PaddedSidebarLink>
        <UploadInput
          id="upload-csv"
          ref={uploadInputRef}
          type="file"
          accept="text/csv,text/tab-separated-values"
          onChange={handleFileUpload}
          data-testid="upload-csv"
        />
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

const UploadTooltip = ({
  collection,
  children,
}: {
  collection: Collection;
  children: ReactNode;
}) => (
  <Tooltip
    tooltip={
      <TooltipContainer>
        <TooltipTitle>{t`Upload data to ${collection.name}`}</TooltipTitle>
        <TooltipSubtitle>{t`${UPLOAD_FILE_TYPES.join(
          ", ",
        )} (${MAX_UPLOAD_STRING} MB max)`}</TooltipSubtitle>
      </TooltipContainer>
    }
    placement="bottom"
  >
    {children}
  </Tooltip>
);
