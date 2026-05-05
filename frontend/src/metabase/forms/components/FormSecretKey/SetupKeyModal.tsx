import { useCallback, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { useLazyGenerateRandomTokenQuery } from "metabase/api/util";
import { IconButtonWrapper } from "metabase/common/components/IconButtonWrapper";
import CS from "metabase/css/core/index.css";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Alert,
  Button,
  Flex,
  Group,
  Icon,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";

type SetupKeyDialogProps = {
  currentValue?: string;
  onClose: () => void;
  onConfirm: (secretKey: string) => void;
};

const MIN_SECRET_LENGTH = 8;

export const SetupKeyModal = (props: SetupKeyDialogProps) => {
  const { currentValue, onClose, onConfirm } = props;
  const [secretValue, setSecretKey] = useState<string>("");
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [generateRandomToken, { isFetching: isGenerating }] =
    useLazyGenerateRandomTokenQuery();

  const generateToken = useCallback(async () => {
    try {
      const result = await generateRandomToken().unwrap();
      setSecretKey(result.token);
    } catch {
      sendErrorToast(t`Error generating secret key.`);
    }
  }, [generateRandomToken, sendErrorToast]);

  useMount(() => {
    void generateToken();
  });

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
                  <IconButtonWrapper
                    aria-label={t`Preview the query`}
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
                  </IconButtonWrapper>
                </Tooltip>
              )
            }
            flex="1 0 auto"
            aria-label={t`New secret key`}
          />
          <Button
            className={CS.flexNoShrink}
            variant="filled"
            onClick={generateToken}
          >
            {t`Regenerate key`}
          </Button>
        </Flex>
        <Stack gap="sm">
          <Alert color="warning">
            <Text component="span">
              {t`Make sure you copy this key now and save it in a safe place.`}{" "}
            </Text>
            <Text fw="bold" component="strong" display="block">
              {t`You won't be able to see it again.`}
            </Text>
          </Alert>
          {!!currentValue && (
            <Alert color="warning">
              <Text mt="md" component="strong" fw="bold">
                {t`This will cause existing tokens to stop working until the identity provider is updated with the new key.`}
              </Text>
            </Alert>
          )}
        </Stack>

        <Group justify="flex-end" gap="sm" mt="sm">
          <Button onClick={onClose} variant="subtle">{t`Cancel`}</Button>
          <Button
            disabled={secretValue.length < MIN_SECRET_LENGTH}
            onClick={() => onConfirm(secretValue)}
            variant="filled"
          >
            {t`Done`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
