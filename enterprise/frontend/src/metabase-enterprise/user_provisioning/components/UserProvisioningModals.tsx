import { useEffect, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import {
  Flex,
  Button,
  Modal,
  type ModalProps,
  Stack,
  Text,
  Icon,
} from "metabase/ui";
import { useRegenerateScimTokenMutation } from "metabase-enterprise/api";

import { CopyScimInput } from "./ScimInputs";

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
    <Modal
      opened={opened}
      title={
        <Text size="lg" style={{ wordBreak: "break-all" }}>
          {t`Here's what you'll need to set SCIM up`}
        </Text>
      }
      onClose={onClose}
      size="35rem"
    >
      <Stack spacing="lg">
        <Text>
          {t`To set up SCIM-based provisioning, you'll need to share this endpoint URL and token with your identity provider.`}
        </Text>
        <CopyScimInput label={t`SCIM endpoint URL`} value={scimBaseUrl} />
        <CopyScimInput
          label={t`SCIM token`}
          value={unmaskedScimToken}
          disabled={false}
        />
        <Text>
          <Icon name="info_filled" />{" "}
          {t`Please copy the token and save it somewhere safe. For security reasons, we can't show the token to you again.`}
        </Text>

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

  const handleConfirm = async () => {
    setConfirmed(true);
    await regenerateToken();
  };

  // TODO: consolidate this logic between the main comopnent
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
      <Modal
        opened={opened}
        title={
          <Text size="lg" style={{ wordBreak: "break-all" }}>
            {t`Regenerate token?`}
          </Text>
        }
        onClose={onClose}
        size="35rem"
      >
        <Stack spacing="lg">
          <Text size="lg" style={{ wordBreak: "break-all" }}>
            {/* eslint-disable-next-line no-literal-metabase-strings -- in admin settings */}
            {t`This will delete the existing token. You'll need to update your identity provider with the new token, otherwise people won't be able to log in to your Metabase.`}
          </Text>
          <Flex justify="end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <Button variant="filled" onClick={handleConfirm}>
              {t`Regenerate now`}
            </Button>
          </Flex>
        </Stack>
      </Modal>
    );
  }

  return (
    <Modal
      opened={opened}
      title={
        <Text size="lg" style={{ wordBreak: "break-all" }}>
          {t`Copy and save the SCIM token`}
        </Text>
      }
      onClose={onClose}
      size="35rem"
    >
      <Stack spacing="lg">
        <CopyScimInput
          label={t`SCIM token`}
          value={scimTokenInputText}
          disabled={false}
        />
        <Text>
          <Icon name="info_filled" />{" "}
          {t`Please copy the token and save it somewhere safe. For security reasons, we can't show the token to you again.`}
        </Text>
        <Flex justify="end">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button variant="filled" onClick={handleConfirm}>
            {t`Regenerate now`}
          </Button>
        </Flex>
      </Stack>
    </Modal>
  );
};
