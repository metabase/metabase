import { t } from "ttag";

import { Button, Modal, Text } from "metabase/ui";

interface AlertProps {
  message?: string | null;
  onClose: () => void;
}

export const Alert = ({ message, onClose }: AlertProps) => (
  <Modal
    size="md"
    opened={Boolean(message)}
    onClose={onClose}
    withCloseButton={false}
    data-testid="alert-modal"
  >
    <Text>{message}</Text>
    <Modal.Footer>
      <Button variant="filled" onClick={onClose}>{t`Ok`}</Button>
    </Modal.Footer>
  </Modal>
);
