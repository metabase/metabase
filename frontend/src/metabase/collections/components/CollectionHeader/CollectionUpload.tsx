import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { t } from "ttag";

import {
  UploadInput,
  UploadLabel,
  UploadTooltip,
} from "metabase/common/components/upload";
import { Button, Icon } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import S from "./CollectionHeaderButton.module.css";
import { UploadInfoModal } from "./CollectionUploadInfoModal";
import { trackCSVFileUploadClicked } from "./analytics";

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
          <Button
            className={S.headerButton}
            variant="subtle"
            aria-label={t`Upload data`}
            leftSection={<Icon name="upload" size={20} />}
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
    trackCSVFileUploadClicked();
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
        <Button
          className={S.headerButton}
          variant="subtle"
          component="span"
          leftSection={<Icon name="upload" size={20} />}
          aria-label={t`Upload data`}
        />
      </UploadLabel>
      <UploadInput ref={uploadInputRef} onChange={handleFileUpload} />
    </UploadTooltip>
  );
}
