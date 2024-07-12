import { useEffect, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { Flex, Button, Modal, type ModalProps, Stack, Text } from "metabase/ui";
import { useRegenerateScimTokenMutation } from "metabase-enterprise/api";

import { CopyScimInput } from "./ScimInputs";
import { ScimTextWarning } from "./ScimTextWarning";

type BaseUserProvisiongModalProps = Pick<ModalProps, "opened" | "onClose">;

interface UserProvisioningFirstEnabledModalProps
  extends BaseUserProvisiongModalProps {
  scimBaseUrl: string;
  unmaskedScimToken: string;
}

export const UserProvisioningFirstEnabledModal = ({
  onClose,
  opened,
  scimBaseUrl,
  unmaskedScimToken,
}: UserProvisioningFirstEnabledModalProps) => {
  return (
    <Modal.Root opened={opened} onClose={onClose} size="35rem">
      <Modal.Overlay />
      <Modal.Content p="md">
        <Modal.Header mb="sm">
          <Modal.Title>{t`Here's what you'll need to set SCIM up`}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack spacing="lg">
            <Text c="text-medium">
              {t`To set up SCIM-based provisioning, you'll need to share this endpoint URL and token with your identity provider.`}
            </Text>
            <CopyScimInput label={t`SCIM endpoint URL`} value={scimBaseUrl} />
            <CopyScimInput
              label={t`SCIM token`}
              value={unmaskedScimToken}
              disabled={false}
            />
            <ScimTextWarning>
              {t`Please copy the token and save it somewhere safe. For security reasons, we can't show the token to you again.`}
            </ScimTextWarning>

            <Flex justify="end">
              <Button variant="filled" onClick={onClose}>
                {t`Done`}
              </Button>
            </Flex>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};

interface UserProvisioningRegenerateTokenModalsProps
  extends BaseUserProvisiongModalProps {}

export const UserProvisioningRegenerateTokenModal = ({
  opened,
  onClose,
}: UserProvisioningRegenerateTokenModalsProps) => {
  const [confirmed, setConfirmed] = useState(false);
  const [regenerateToken, regenerateTokenReq] =
    useRegenerateScimTokenMutation();

  useEffect(() => {
    if (!opened) {
      setConfirmed(false);
      regenerateTokenReq.reset();
    }
  }, [opened, regenerateTokenReq]);

  const handleConfirmRegenerate = async () => {
    setConfirmed(true);
    await regenerateToken();
  };

  const scimTokenInputText = match(regenerateTokenReq)
    .with({ isUninitialized: true }, () => t`Loading...`)
    .with({ isLoading: true }, () => t`Loading...`)
    .with(
      { isError: true },
      { error: P.not(P.nullish) },
      () => t`Error loading token...`,
    )
    .with({ data: P.not(undefined) }, ({ data }) => data.unmasked_key)
    .exhaustive();

  if (!confirmed) {
    return (
      <Modal.Root opened={opened} onClose={onClose} size="35rem">
        <Modal.Overlay />
        <Modal.Content p="md">
          <Modal.Header mb="md">
            <Modal.Title>{t`Regenerate token?`}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Stack spacing="lg">
              <Text>
                {/* eslint-disable-next-line no-literal-metabase-strings -- in admin settings */}
                {t`This will delete the existing token. You'll need to update your identity provider with the new token, otherwise people won't be able to log in to your Metabase.`}
              </Text>
              <Flex justify="end" gap="md">
                <Button onClick={onClose}>{t`Cancel`}</Button>
                <Button variant="filled" onClick={handleConfirmRegenerate}>
                  {t`Regenerate now`}
                </Button>
              </Flex>
            </Stack>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    );
  }

  return (
    <Modal.Root opened={opened} onClose={onClose} size="35rem">
      <Modal.Overlay />
      <Modal.Content p="md">
        <Modal.Header mb="md">
          <Modal.Title>{t`Copy and save the SCIM token`}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack spacing="lg">
            <CopyScimInput
              label={t`SCIM token`}
              value={scimTokenInputText}
              disabled={false}
            />
            <ScimTextWarning>
              {t`Please copy the token and save it somewhere safe. For security reasons, we can't show the token to you again.`}
            </ScimTextWarning>
            <Flex justify="end">
              <Button variant="filled" onClick={onClose}>
                {t`Done`}
              </Button>
            </Flex>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
