import { t } from "ttag";

import { CopyTextInput } from "metabase/common/components/CopyTextInput";
import { Button, Modal, Stack, Text } from "metabase/ui";

import S from "./SecretKeyModal.module.css";

export const SecretKeyModal = ({
  secretKey,
  onClose,
}: {
  secretKey: string;
  onClose: () => void;
}) => (
  <Modal
    size="40rem"
    opened
    onClose={onClose}
    title={t`Copy and save this API key`}
    data-testid="secret-key-modal"
  >
    <Stack gap="xl">
      <Text c="text-secondary">{t`Store this key somewhere safe. For security reasons, we can't show it to you again.`}</Text>
      <CopyTextInput
        aria-label={t`The API key`}
        value={secretKey}
        classNames={{ input: S.keyInput }}
      />
    </Stack>
    <Modal.Footer>
      <Button onClick={onClose} variant="filled">{t`Done`}</Button>
    </Modal.Footer>
  </Modal>
);
