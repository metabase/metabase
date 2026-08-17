import { useCallback } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { useLazyGenerateRandomTokenQuery } from "metabase/api/util";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  ActionIcon,
  Button,
  CopyButton,
  Group,
  Icon,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";

import S from "./FormSecretKey.module.css";

type SecretKeyModalProps = {
  title: string;
  confirmLabel: string;
  withCancelButton?: boolean;
  onConfirm: (secretKey: string) => void;
  onClose: () => void;
};

export const SecretKeyModal = ({
  title,
  confirmLabel,
  withCancelButton = false,
  onConfirm,
  onClose,
}: SecretKeyModalProps) => {
  const { sendErrorToast } = useMetadataToasts();
  const [generateRandomToken, { data, isFetching }] =
    useLazyGenerateRandomTokenQuery();

  const generateToken = useCallback(async () => {
    try {
      await generateRandomToken().unwrap();
    } catch {
      sendErrorToast(t`Error generating secret key.`);
    }
  }, [generateRandomToken, sendErrorToast]);

  useMount(() => {
    void generateToken();
  });

  const secretKey = data?.token ?? "";

  return (
    <Modal opened onClose={onClose} title={title}>
      <Stack gap="lg">
        <Text c="text-secondary">
          {t`Store this key somewhere safe. For security reasons, we can't show it to you again.`}
        </Text>

        <TextInput
          aria-label={t`New secret key`}
          value={secretKey}
          readOnly
          classNames={{ input: S.secretKeyInput }}
          rightSectionPointerEvents="all"
          rightSection={
            isFetching ? (
              <Loader size="xs" />
            ) : (
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
            )
          }
        />

        <Group justify="flex-end" gap="sm">
          {withCancelButton && (
            <Button onClick={onClose} variant="subtle">{t`Cancel`}</Button>
          )}
          <Button
            disabled={!secretKey}
            onClick={() => onConfirm(secretKey)}
            variant="filled"
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
