import { t } from "ttag";

import { Button, Modal, Stack, Text } from "metabase/ui";

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
    <Stack gap="xl">
      <Text>{message}</Text>
      <Button variant="filled" ml="auto" onClick={onClose}>{t`Ok`}</Button>
    </Stack>
  </Modal>
);
