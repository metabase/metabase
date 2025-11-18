import { t } from "ttag";

import { Button, Flex, Modal, Textarea } from "metabase/ui";

interface RevisionMessageModalProps {
  opened: boolean;
  onClose: () => void;
  action: () => void;
  field: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    error?: string;
    name: string;
  };
  submitting?: boolean;
}

export function RevisionMessageModal({
  opened,
  onClose,
  action,
  field,
  submitting,
}: RevisionMessageModalProps) {
  // eslint-disable-next-line no-console
  console.log("RevisionMessageModal render:", {
    fieldValue: field.value,
    fieldError: field.error,
    submitting,
    isDisabled: submitting || !!field.error,
  });

  const handleAction = () => {
    onClose();
    action();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t`Reason for changes`}
      size="lg"
    >
      <Flex direction="column" gap="md">
        <Textarea
          placeholder={t`Leave a note to explain what changes you made and why they were required`}
          value={field.value}
          onChange={field.onChange}
          name={field.name}
          autosize
          minRows={4}
        />
        <Flex justify="flex-end" gap="sm">
          <Button onClick={onClose}>{t`Cancel`}</Button>
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
  );
}
