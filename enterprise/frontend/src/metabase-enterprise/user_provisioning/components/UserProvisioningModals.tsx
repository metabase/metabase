import { useEffect, useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Button, Flex, Modal, type ModalProps, Stack, Text } from "metabase/ui";
import type { useRegenerateScimTokenMutation } from "metabase-enterprise/api";

import { CopyScimInput } from "./ScimInputs";
import { ScimTextWarning } from "./ScimTextWarning";

type BaseUserProvisiongModalProps = Pick<ModalProps, "opened" | "onClose">;

interface UserProvisioningFirstEnabledModalProps extends BaseUserProvisiongModalProps {
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
      <Stack gap="lg">
        <Text c="text-secondary">
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

type RegenerateMutation = ReturnType<typeof useRegenerateScimTokenMutation>;

type UserProvisioningRegenerateTokenModalsProps =
  BaseUserProvisiongModalProps & {
    regenerateToken: RegenerateMutation[0];
    regenerateTokenReq: RegenerateMutation[1];
  };

export const UserProvisioningRegenerateTokenModal = ({
  opened,
  onClose,
  regenerateToken,
  regenerateTokenReq,
}: UserProvisioningRegenerateTokenModalsProps) => {
  const [confirmed, setConfirmed] = useState(false);

  // Don't reset the mutation on close — the parent form needs the error to persist.
  useEffect(() => {
    if (!opened) {
      setConfirmed(false);
    }
  }, [opened]);

  const handleConfirmRegenerate = async () => {
    setConfirmed(true);
    const result = await regenerateToken();
    if ("error" in result && result.error) {
      onClose();
    }
  };

  if (!confirmed) {
    return (
      <ConfirmModal
        opened={opened}
        onClose={onClose}
        title={t`Regenerate token?`}
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin settings
        message={t`This will delete the existing token. You'll need to update your identity provider with the new token, otherwise people won't be able to log in to your Metabase.`}
        confirmButtonText={t`Regenerate now`}
        confirmButtonProps={{ variant: "filled", color: "core-brand" }}
        onConfirm={handleConfirmRegenerate}
      />
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
      <Stack gap="lg" mt="0.5rem">
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
