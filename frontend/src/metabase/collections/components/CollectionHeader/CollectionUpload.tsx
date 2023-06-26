import { useState, ChangeEvent } from "react";
import { t } from "ttag";

import type { Collection, CollectionId } from "metabase-types/api";

import Tooltip, {
  TooltipContainer,
  TooltipTitle,
  TooltipSubtitle,
} from "metabase/core/components/Tooltip";

import { MAX_UPLOAD_STRING } from "metabase/redux/uploads";

import { CollectionHeaderButton } from "./CollectionHeader.styled";
import { UploadInput } from "./CollectionUpload.styled";
import { UploadInfoModal } from "./CollectionUploadInfoModal";

const UPLOAD_FILE_TYPES = [".csv"];

export function CollectionUpload({
  collection,
  uploadsEnabled,
  isAdmin,
  onUpload,
}: {
  collection: Collection;
  uploadsEnabled: boolean;
  isAdmin: boolean;
  onUpload: (file: File, collectionId: CollectionId) => void;
}) {
  const [showInfoModal, setShowInfoModal] = useState(false);

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
      onUpload(file, collection.id);
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
        type="file"
        accept="text/csv"
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
          ",",
        )} (${MAX_UPLOAD_STRING} max)`}</TooltipSubtitle>
      </TooltipContainer>
    }
    placement="bottom"
  >
    {children}
  </Tooltip>
);
