import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { t } from "ttag";

import { Button, Flex, Modal, Textarea } from "metabase/ui";

interface RevisionMessageModalProps {
  action: () => void;
  field: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    error?: string;
  };
  submitting?: boolean;
  children: ReactNode;
}

export function RevisionMessageModal({
  action,
  children,
  field,
  submitting,
}: RevisionMessageModalProps) {
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  const handleAction = () => {
    closeModal();
    action();
  };

  return (
    <>
      <div onClick={openModal}>{children}</div>
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={t`Reason for changes`}
        size="lg"
      >
        <Flex direction="column" gap="md">
          <Textarea
            placeholder={t`Leave a note to explain what changes you made and why they were required`}
            value={field.value}
            onChange={field.onChange}
            autosize
            minRows={4}
          />
          <Flex justify="flex-end" gap="sm">
            <Button onClick={closeModal}>{t`Cancel`}</Button>
            <Button
              variant="filled"
              onClick={handleAction}
              disabled={submitting || !!field.error}
            >
              {t`Save changes`}
            </Button>
          </Flex>
        </Flex>
      </Modal>
    </>
  );
}
