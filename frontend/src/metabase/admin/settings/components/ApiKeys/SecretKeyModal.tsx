import { t } from "ttag";

import {
  ActionIcon,
  Button,
  CopyButton,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";

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
    <Stack gap="lg">
      <Text c="text-secondary">{t`Store this key somewhere safe. For security reasons, we can't show it to you again.`}</Text>
      <TextInput
        aria-label={t`The API key`}
        value={secretKey}
        readOnly
        classNames={{ input: S.keyInput }}
        rightSectionPointerEvents="all"
        rightSection={
          <CopyButton value={secretKey} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={t`Copied!`} opened={copied}>
                <ActionIcon
                  variant="subtle"
                  aria-label={t`Copy`}
                  onClick={copy}
                >
                  <Icon name="copy" />
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        }
      />
      <Group justify="flex-end">
        <Button onClick={onClose} variant="filled">{t`Done`}</Button>
      </Group>
    </Stack>
  </Modal>
);
