import { type ReactNode, useEffect, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useForcePasswordResetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useToast } from "metabase/common/hooks/use-toast";
import { Checkbox, Stack, Text, TextInput } from "metabase/ui";
import * as Urls from "metabase/urls";
import { redirect } from "metabase/utils/dom";
import MetabaseSettings from "metabase/utils/settings";
import type { ForcePasswordResetResponse } from "metabase-types/api";

const getResultMessage = ({ users_reset }: ForcePasswordResetResponse) =>
  ngettext(
    msgid`Forced a password reset for ${users_reset} person.`,
    `Forced a password reset for ${users_reset} people.`,
    users_reset,
  );

interface ForcePasswordResetConfirmModalProps {
  title: string;
  message: string;
  children?: ReactNode;
  isConfirmDisabled?: boolean;
  onConfirm: () => Promise<ForcePasswordResetResponse>;
  onClose: () => void;
}

const ForcePasswordResetConfirmModal = ({
  title,
  message,
  children,
  isConfirmDisabled = false,
  onConfirm,
  onClose,
}: ForcePasswordResetConfirmModalProps) => {
  const [sendToast] = useToast();
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleConfirm = async () => {
    try {
      const result = await onConfirm();
      sendToast({ message: getResultMessage(result) });
      onClose();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  return (
    <ConfirmModal
      opened
      title={title}
      message={
        <Stack gap="md">
          <Text>{message}</Text>
          {children}
        </Stack>
      }
      confirmButtonText={t`Force password reset`}
      confirmButtonProps={{ disabled: isConfirmDisabled }}
      errorMessage={errorMessage}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
};

interface EveryoneForcePasswordResetModalProps {
  onClose: () => void;
}

/**
 * Confirms forcing every active user to set a new password, then forces it. The current user is left out unless they
 * opt in, in which case they are signed out and sent to the sign-in page. Needs email, as the API does: without it,
 * nobody locked out could get a link to set a new password, so the modal closes at once.
 */
export const EveryoneForcePasswordResetModal = ({
  onClose,
}: EveryoneForcePasswordResetModalProps) => {
  const isEmailConfigured = MetabaseSettings.isEmailConfigured();

  useEffect(() => {
    if (!isEmailConfigured) {
      onClose();
    }
  }, [isEmailConfigured, onClose]);

  return isEmailConfigured ? (
    <EveryoneForcePasswordResetConfirmModal onClose={onClose} />
  ) : null;
};

const EveryoneForcePasswordResetConfirmModal = ({
  onClose,
}: EveryoneForcePasswordResetModalProps) => {
  const [forcePasswordReset] = useForcePasswordResetMutation();
  const [includeSelf, setIncludeSelf] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  // including yourself locks you out too, so it takes a phrase that says so
  const confirmationPhrase = includeSelf
    ? t`reset everyone including me`
    : t`reset everyone`;
  const isConfirmed =
    confirmationText.trim().toLowerCase() === confirmationPhrase.toLowerCase();

  const handleConfirm = async () => {
    const result = await forcePasswordReset({
      all: true,
      include_self: includeSelf,
    }).unwrap();
    if (includeSelf) {
      redirect(Urls.login());
    }
    return result;
  };

  return (
    <ForcePasswordResetConfirmModal
      title={t`Force everyone to reset their password?`}
      message={
        includeSelf
          ? t`Everyone, including you, will be logged out right away and their current passwords will stop working. Nobody will be able to use Metabase again until they set a new password.`
          : t`Everyone, except you, will be logged out right away and their current passwords will stop working. Nobody will be able to use Metabase again until they set a new password.`
      }
      isConfirmDisabled={!isConfirmed}
      onConfirm={handleConfirm}
      onClose={onClose}
    >
      <Checkbox
        label={t`Include me`}
        checked={includeSelf}
        onChange={(event) => setIncludeSelf(event.currentTarget.checked)}
      />
      <TextInput
        label={t`Type "${confirmationPhrase}" to confirm`}
        value={confirmationText}
        autoComplete="off"
        onChange={(event) => setConfirmationText(event.currentTarget.value)}
      />
    </ForcePasswordResetConfirmModal>
  );
};
