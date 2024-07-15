import type { ChangeEvent } from "react";
import { useState, useRef } from "react";
import { t } from "ttag";

import {
  UploadInput,
  UploadLabel,
  UploadTooltip,
} from "metabase/components/upload";
import type { Collection } from "metabase-types/api";

import { CollectionHeaderButton } from "./CollectionHeader.styled";
import { UploadInfoModal } from "./CollectionUploadInfoModal";

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
      <UploadLabel>
        <CollectionHeaderButton
          as="span"
          to=""
          icon="upload"
          iconSize={20}
          aria-label={t`Upload data`}
        />
      </UploadLabel>
      <UploadInput ref={uploadInputRef} onChange={handleFileUpload} />
    </UploadTooltip>
  );
}
