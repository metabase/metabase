import { useState } from "react";
import { useUnmount } from "react-use";
import { c, t } from "ttag";

import {
  useForcePasswordResetMutation,
  useForgotPasswordMutation,
  useGetPasswordResetUrlMutation,
  useGetUserQuery,
  useUpdatePasswordMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { CopyButton } from "metabase/common/components/CopyButton";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PasswordReveal } from "metabase/common/components/PasswordReveal";
import { useToast } from "metabase/common/hooks/use-toast";
import { getUserId } from "metabase/current-user";
import { useDispatch, useSelector } from "metabase/redux";
import { Button, Checkbox, Modal, Stack, Text, TextInput } from "metabase/ui";
import * as Urls from "metabase/urls";
import { redirect } from "metabase/utils/dom";
import { generatePassword } from "metabase/utils/password";
import MetabaseSettings from "metabase/utils/settings";
import type { User } from "metabase-types/api";

import { clearTemporaryPassword, storeTemporaryPassword } from "../people";
import {
  getIsUserSsoSourceEnabled,
  getUserTemporaryPassword,
} from "../selectors";

interface UserPasswordResetModalInnerProps {
  clearTemporaryPassword: () => void;
  storeTemporaryPassword: (id: number, password: string) => void;
  onClose: () => void;
  user: User;
  emailConfigured: boolean;
  temporaryPassword: string | null;
}

const UserPasswordResetModalInner = ({
  clearTemporaryPassword,
  storeTemporaryPassword,
  emailConfigured,
  onClose,
  temporaryPassword,
  user,
}: UserPasswordResetModalInnerProps) => {
  useUnmount(() => {
    clearTemporaryPassword();
  });

  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [isForced, setIsForced] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  // locking someone out takes typing their email, so it can't be done to the wrong person by accident
  const isConfirmed =
    !isForced ||
    confirmationText.trim().toLowerCase() === user.email.toLowerCase();

  const [sendToast] = useToast();
  const [updatePassword] = useUpdatePasswordMutation();
  const [resetPasswordEmail] = useForgotPasswordMutation();
  const [getPasswordResetUrl] = useGetPasswordResetUrlMutation();
  const [forcePasswordReset] = useForcePasswordResetMutation();
  const isCurrentUser = useSelector(getUserId) === user.id;

  const handleResetConfirm = async () => {
    if (emailConfigured) {
      if (isForced) {
        // locks them out, then emails them a link to set a new password
        await forcePasswordReset({ user_ids: [user.id] }).unwrap();
        if (isCurrentUser) {
          // they have just locked themselves out, ending this session too
          redirect(Urls.login());
          return;
        }
      } else {
        await resetPasswordEmail(user.email).unwrap();
      }

      sendToast({
        message: c("{0} is the name of the user")
          .t`Password reset email sent to ${user.common_name}`,
      });

      onClose();
    } else {
      const password = generatePassword();
      await updatePassword({ id: user.id, password }).unwrap();
      storeTemporaryPassword(user.id, password);
    }
  };

  const handleGetResetLink = async () => {
    const result = await getPasswordResetUrl(user.id).unwrap();
    setResetUrl(result.password_reset_url);
  };

  if (resetUrl) {
    return (
      <ConfirmModal
        opened
        title={t`Password reset link for ${user.common_name}`}
        onConfirm={onClose}
        confirmButtonProps={{ color: "brand", variant: "filled" }}
        confirmButtonText={t`Done`}
        closeButtonText={null}
        onClose={onClose}
        message={
          <>
            <Text pb="xl">{t`Share this link with the user. It will expire in 48 hours.`}</Text>
            <TextInput
              value={resetUrl}
              readOnly
              rightSection={<CopyButton value={resetUrl} />}
              onClick={(e) => e.currentTarget.select()}
            />
          </>
        }
      />
    );
  }

  if (temporaryPassword) {
    return (
      <ConfirmModal
        opened
        title={t`${user.common_name}'s password has been reset`}
        onConfirm={onClose}
        confirmButtonProps={{ color: "brand", variant: "filled" }}
        confirmButtonText={t`Done`}
        closeButtonText={null}
        onClose={onClose}
        message={
          <>
            <Text pb="xl">{t`Here's a temporary password they can use to log in and then change their password.`}</Text>
            <PasswordReveal password={temporaryPassword} />
          </>
        }
      />
    );
  }

  return (
    <Modal
      opened
      title={t`Reset ${user.common_name}'s password?`}
      onClose={onClose}
      size="lg"
    >
      <Stack gap="lg">
        <Text>{t`Are you sure you want to do this?`}</Text>
        <Checkbox
          label={t`Log them out and block their current password`}
          checked={isForced}
          onChange={(event) => setIsForced(event.currentTarget.checked)}
        />
        {isForced && (
          <TextInput
            label={t`Type "${user.email}" to confirm`}
            value={confirmationText}
            autoComplete="off"
            onChange={(event) => setConfirmationText(event.currentTarget.value)}
          />
        )}
      </Stack>
      <Modal.Footer>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          color="brand"
          disabled={isForced}
          onClick={handleGetResetLink}
        >{t`Get reset link`}</Button>
        <Button
          color="negative"
          variant="filled"
          disabled={!isConfirmed}
          onClick={handleResetConfirm}
        >{t`Reset password`}</Button>
      </Modal.Footer>
    </Modal>
  );
};

interface SsoUserPasswordResetModalProps {
  user: User;
  onClose: () => void;
}

const SsoUserPasswordResetModal = ({
  user,
  onClose,
}: SsoUserPasswordResetModalProps) => (
  <ConfirmModal
    opened
    title={t`Can't reset ${user.common_name}'s password`}
    onConfirm={onClose}
    confirmButtonProps={{ color: "brand", variant: "filled" }}
    confirmButtonText={t`Done`}
    closeButtonText={null}
    onClose={onClose}
    message={t`This user signs in with single sign-on. Manage their access through your identity provider.`}
  />
);

interface UserPasswordResetModalProps {
  params: { userId?: string };
  onClose: () => void;
}

export const UserPasswordResetModal = (props: UserPasswordResetModalProps) => {
  const userId = parseInt(props.params.userId ?? "");

  const dispatch = useDispatch();

  const { data: user, isLoading, error } = useGetUserQuery(userId);
  const temporaryPassword = useSelector((state) =>
    getUserTemporaryPassword(state, { userId }),
  );
  const isUserSsoSourceEnabled = useSelector(
    (state) => user != null && getIsUserSsoSourceEnabled(state, user),
  );

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error}>
      {user && isUserSsoSourceEnabled && (
        <SsoUserPasswordResetModal user={user} onClose={props.onClose} />
      )}
      {user && !isUserSsoSourceEnabled && (
        <UserPasswordResetModalInner
          {...props}
          clearTemporaryPassword={() =>
            dispatch(clearTemporaryPassword(user.id))
          }
          storeTemporaryPassword={(id, password) =>
            dispatch(storeTemporaryPassword({ id, password }))
          }
          user={user}
          emailConfigured={MetabaseSettings.isEmailConfigured()}
          temporaryPassword={temporaryPassword}
        />
      )}
    </LoadingAndErrorWrapper>
  );
};
