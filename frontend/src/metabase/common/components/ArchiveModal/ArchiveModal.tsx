import type { ReactNode } from "react";
import { t } from "ttag";

import { archiveAndTrack } from "metabase/archive/analytics";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { Button, Modal, Text } from "metabase/ui";

interface ArchiveModalProps {
  title?: string;
  message?: ReactNode;
  model: "card" | "model" | "metric" | "dashboard" | "collection";
  // null matches SimpleEventSchema's target_id for entities without a numeric id
  modelId: number | null;
  isLoading?: boolean;
  onArchive: () => Promise<void>;
  onClose: () => void;
}

export const ArchiveModal = ({
  title,
  message,
  model,
  modelId,
  isLoading,
  onClose,
  onArchive,
}: ArchiveModalProps) => {
  const archiveButtonLabel = t`Move to trash`;

  const archive = async () => {
    await archiveAndTrack({
      archive: onArchive,
      model,
      modelId,
      triggeredFrom: "detail_page",
    });
    onClose();
  };

  return (
    <Modal opened title={title || t`Trash this?`} onClose={onClose}>
      <FormProvider initialValues={{}} onSubmit={archive}>
        <Form>
          <Text>{message}</Text>
          <Modal.Footer>
            <FormErrorMessage flex={1} />
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              color="negative"
              variant="filled"
              label={archiveButtonLabel}
              activeLabel={archiveButtonLabel}
              successLabel={archiveButtonLabel}
              failedLabel={archiveButtonLabel}
              disabled={isLoading}
              data-autofocus
            />
          </Modal.Footer>
        </Form>
      </FormProvider>
    </Modal>
  );
};
