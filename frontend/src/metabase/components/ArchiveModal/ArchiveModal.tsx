import { useState } from "react";
import { t } from "ttag";

import { archiveAndTrack } from "metabase/archive/analytics";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import { FormMessage } from "metabase/forms";

interface ArchiveModalProps {
  title?: string;
  message: React.ReactNode;
  model: "card" | "model" | "metric" | "dashboard" | "collection";
  modelId: number;
  onArchive: () => Promise<void>;
  onClose?: () => void;
}

export const ArchiveModal = ({
  title,
  message,
  model,
  modelId,
  onClose,
  onArchive,
}: ArchiveModalProps) => {
  const [error, setError] = useState();

  const archive = async () => {
    await archiveAndTrack({
      archive: onArchive,
      model,
      modelId,
      triggeredFrom: "detail_page",
    })
      .catch(error => setError(error))
      .finally(() => {
        onClose?.();
      });
  };

  return (
    <ModalContent
      title={title || t`Trash this?`}
      footer={[
        error ? <FormMessage key="message" formError={error} /> : null,
        <Button key="cancel" onClick={onClose}>
          {t`Cancel`}
        </Button>,
        <Button key="archive" warning onClick={archive}>
          {t`Move to trash`}
        </Button>,
      ]}
    >
      {message}
    </ModalContent>
  );
};
