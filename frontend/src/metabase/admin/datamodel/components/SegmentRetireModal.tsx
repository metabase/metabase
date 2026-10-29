import { t } from "ttag";

import { Button, Modal, Text } from "metabase/ui";

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
      <Text>
        {t`Saved questions and other things that depend on this segment will continue to work, but it will no longer be selectable from the query builder.`}
      </Text>
      <Modal.Footer>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button color="negative" variant="filled" onClick={handleRetire}>
          {t`Retire`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
