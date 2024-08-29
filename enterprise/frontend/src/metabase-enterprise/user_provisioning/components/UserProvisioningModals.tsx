import { useEffect, useState } from "react";
import { t } from "ttag";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Button, Flex, Modal, type ModalProps, Stack, Text } from "metabase/ui";
import { useRegenerateScimTokenMutation } from "metabase-enterprise/api";

import { CopyScimInput } from "./ScimInputs";
import { ScimTextWarning } from "./ScimTextWarning";

type BaseUserProvisiongModalProps = Pick<ModalProps, "opened" | "onClose">;

interface UserProvisioningFirstEnabledModalProps
  extends BaseUserProvisiongModalProps {
  scimBaseUrl: string;
  unmaskedScimToken: string;
  scimError: any;
}

export const UserProvisioningFirstEnabledModal = ({
  onClose,
  opened,
  scimBaseUrl,
  unmaskedScimToken,
  scimError,
}: UserProvisioningFirstEnabledModalProps) => {
  return (
    <Modal
      padding="2rem"
      size="35rem"
      opened={opened}
      onClose={onClose}
      title={t`Here's what you'll need to set SCIM up`}
    >
      <Stack spacing="lg">
        <Text c="text-medium">
          {t`To set up SCIM-based provisioning, you'll need to share this endpoint URL and token with your identity provider.`}
        </Text>
        <CopyScimInput label={t`SCIM endpoint URL`} value={scimBaseUrl} />
        <CopyScimInput
          label={t`SCIM token`}
          value={unmaskedScimToken}
          error={
            scimError && t`Token failed to generate, please regenerate one.`
          }
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
    </Modal>
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

  if (!confirmed) {
    return (
      <Modal
        size="35rem"
        padding="2rem"
        opened={opened}
        onClose={onClose}
        title={t`Regenerate token?`}
      >
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
      </Modal>
    );
  }

  const scimTokenInputText = regenerateTokenReq.data?.unmasked_key ?? "";

  return (
    <Modal
      size="35rem"
      padding="2rem"
      opened={opened}
      onClose={onClose}
      title={t`Copy and save the SCIM token`}
    >
      <Stack spacing="lg" mt="0.5rem">
        <LoadingAndErrorWrapper
          error={regenerateTokenReq.error}
          loading={regenerateTokenReq.isLoading}
        >
          <CopyScimInput
            label={t`SCIM token`}
            value={scimTokenInputText}
            disabled={false}
          />
          <ScimTextWarning>
            {t`Please copy the token and save it somewhere safe. For security reasons, we can't show the token to you again.`}
          </ScimTextWarning>
        </LoadingAndErrorWrapper>
        <Flex justify="end">
          {!regenerateTokenReq.error ? (
            <Button variant="filled" onClick={onClose}>
              {t`Done`}
            </Button>
          ) : (
            <Button onClick={onClose}>{t`Cancel`}</Button>
          )}
        </Flex>
      </Stack>
    </Modal>
  );
};
