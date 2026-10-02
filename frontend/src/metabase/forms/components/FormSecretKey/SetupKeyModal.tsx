// TODO (Kelvin 2026-08-27) rename this file to SecretKeyModal.tsx to match
// the component name; kept as SetupKeyModal.tsx for now to keep the diff
// reviewable.
import { useCallback, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { useLazyGenerateRandomTokenQuery } from "metabase/api/util";
import { getCopyTextFieldProps } from "metabase/common/components/CopyTextField/copy-text-field-props";
import { useMetadataToasts } from "metabase/common/hooks";
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
      // Nothing to protect from an accidental dismissal, and the modal offers
      // no other way out.
      onClose();
    }
  }, [generateRandomToken, sendErrorToast, onClose]);

  useMount(() => {
    void generateToken();
  });

<<<<<<< 8bfda478850
  return (
    <Modal onClose={onClose} opened title={t`Set up secret key`}>
      <Stack>
        <Flex align="end" gap="1rem">
          <TextInput
            onChange={(event) => setSecretKey(event.target.value || "")}
            value={secretValue}
            disabled={isGenerating}
            rightSection={
              isGenerating ? (
                <Loader size="xs" />
              ) : (
                <Tooltip label={t`Copy to clipboard`}>
                  <ActionIcon
                    aria-label={t`Copy to clipboard`}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(secretValue);
                        sendSuccessToast(t`Secret key copied to clipboard`);
                      } catch {
                        sendErrorToast(
                          t`Error copying secret key to clipboard.`,
                        );
                      }
                    }}
                  >
                    <Icon name="copy" />
                  </ActionIcon>
                </Tooltip>
              )
            }
            flex="1 0 auto"
            aria-label={t`New secret key`}
          />
          <Button
            flex="0 0 auto"
            variant="filled"
            size="lg"
            onClick={generateToken}
          >
            {t`Regenerate key`}
          </Button>
        </Flex>
        <Stack gap="sm">
          <Alert size="compact" color="warning">
            {t`Make sure you copy this key now and save it in a safe place.`}
            <Text fw="bold" component="strong" display="block">
              {t`You won't be able to see it again.`}
            </Text>
          </Alert>
          {!!currentValue && (
            <Alert size="compact" color="warning" mt="lg">
              <Text component="strong" fw="bold">
                {t`This will cause existing tokens to stop working until the identity provider is updated with the new key.`}
              </Text>
            </Alert>
          )}
        </Stack>
=======
  const copyFieldProps = getCopyTextFieldProps({ value: secretKey });
>>>>>>> d53a909a92f^

  return (
    <Modal
      opened
      onClose={onClose}
      title={title}
      // No escape hatches: the key is unrecoverable once this closes. A hung
      // request keeps the modal up until fetch gives up and the catch closes it.
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <Stack gap="xl" mt="lg">
        <Text>
          {t`Store this key somewhere safe. For security reasons, we can't show it to you again.`}
        </Text>

        <TextInput
          aria-label={t`New secret key`}
          value={secretKey}
          classNames={{ input: S.secretKeyInput }}
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
