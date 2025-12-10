import { t } from "ttag";

import { Button, Flex, Modal, Text } from "metabase/ui";

interface SegmentRetireModalProps {
  opened: boolean;
  onClose: () => void;
  onRetire: () => void;
}

export function SegmentRetireModal({
  opened,
  onClose,
  onRetire,
}: SegmentRetireModalProps) {
  const handleRetire = () => {
    onRetire();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t`Retire this segment?`}
      size="lg"
    >
      <Flex direction="column">
        <Text>
          {t`Saved questions and other things that depend on this segment will continue to work, but it will no longer be selectable from the query builder.`}
        </Text>
        <Flex justify="flex-end" gap="sm">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button color="danger" variant="filled" onClick={handleRetire}>
            {t`Retire`}
          </Button>
        </Flex>
      </Flex>
    </Modal>
  );
}
