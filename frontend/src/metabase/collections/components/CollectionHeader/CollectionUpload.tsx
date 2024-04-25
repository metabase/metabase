import type { ChangeEvent } from "react";
import { useState, useRef } from "react";
import { t } from "ttag";

import Tooltip, {
  TooltipContainer,
  TooltipTitle,
  TooltipSubtitle,
} from "metabase/core/components/Tooltip";
import { MAX_UPLOAD_STRING } from "metabase/redux/uploads";
import type { Collection } from "metabase-types/api";

import { CollectionHeaderButton } from "./CollectionHeader.styled";
import { UploadInput } from "./CollectionUpload.styled";
import { UploadInfoModal } from "./CollectionUploadInfoModal";

const UPLOAD_FILE_TYPES = [".csv", ".tsv"];

export function CollectionUpload({
  collection,
  uploadsEnabled,
  isAdmin,
  saveFile,
}: {
  collection: Collection;
  uploadsEnabled: boolean;
  isAdmin: boolean;
  saveFile: (file: File) => void;
}) {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  if (!uploadsEnabled) {
    return (
      <>
        <UploadTooltip collection={collection}>
          <CollectionHeaderButton
            aria-label={t`Upload data`}
            icon="upload"
            iconSize={20}
            onClick={() => setShowInfoModal(true)}
          />
        </UploadTooltip>
        {showInfoModal && (
          <UploadInfoModal
            isAdmin={isAdmin}
            onClose={() => setShowInfoModal(false)}
          />
        )}
      </>
    );
  }

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

  return (
    <UploadTooltip collection={collection}>
      <label htmlFor="upload-csv">
        <CollectionHeaderButton
          as="span"
          to=""
          icon="upload"
          iconSize={20}
          aria-label={t`Upload data`}
        />
      </label>
      <UploadInput
        id="upload-csv"
        ref={uploadInputRef}
        type="file"
        accept="text/csv,text/tab-separated-values"
        onChange={handleFileUpload}
        data-testid="upload-input"
      />
    </UploadTooltip>
  );
}

const UploadTooltip = ({
  collection,
  children,
}: {
  collection: Collection;
  children: React.ReactNode;
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
