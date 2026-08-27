// TODO (Kelvin 2026-08-27) rename this file to SecretKeyModal.tsx to match
// the component name; kept as SetupKeyModal.tsx for now to keep the diff
// reviewable.
import { useCallback, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { useLazyGenerateRandomTokenQuery } from "metabase/api/util";
import { getCopyTextFieldProps } from "metabase/common/components/CopyTextField/copy-text-field-props";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
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
  const [generateRandomToken] = useLazyGenerateRandomTokenQuery();

  // Held locally rather than read from the query cache: the cached token is
  // the one generated last time the modal was open, and showing it would let
  // the user copy a key that is about to be replaced.
  const [secretKey, setSecretKey] = useState("");

  const generateToken = useCallback(async () => {
    try {
      const { token } = await generateRandomToken().unwrap();
      setSecretKey(token);
    } catch {
      sendErrorToast(t`Error generating secret key.`);
    }
  }, [generateRandomToken, sendErrorToast]);

  useMount(() => {
    void generateToken();
  });

  const copyFieldProps = getCopyTextFieldProps({ value: secretKey });

  return (
    <Modal
      opened
      onClose={onClose}
      title={title}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <Stack gap="lg" mt="md">
        <Text>
          {t`Store this key somewhere safe. For security reasons, we can't show it to you again.`}
        </Text>

        <TextInput
          aria-label={t`New secret key`}
          value={secretKey}
          classNames={{ input: S.secretKeyInput }}
          tabIndex={-1}
          {...copyFieldProps}
          rightSection={
            !secretKey ? <Loader size="xs" /> : copyFieldProps.rightSection
          }
        />

        <Group justify="flex-end" gap="sm">
          {withCancelButton && <Button onClick={onClose}>{t`Cancel`}</Button>}
          <Button
            data-autofocus
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
