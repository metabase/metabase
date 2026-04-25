import { useState } from "react";
import { useUnmount } from "react-use";
import { c, t } from "ttag";

import {
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
import { useDispatch, useSelector } from "metabase/redux";
import { Button, Flex, Modal, Text, TextInput } from "metabase/ui";
import { generatePassword } from "metabase/utils/password";
import MetabaseSettings from "metabase/utils/settings";
import type { User } from "metabase-types/api";

import { clearTemporaryPassword, storeTemporaryPassword } from "../people";
import { getUserTemporaryPassword } from "../selectors";

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

  const [sendToast] = useToast();
  const [updatePassword] = useUpdatePasswordMutation();
  const [resetPasswordEmail] = useForgotPasswordMutation();
  const [getPasswordResetUrl] = useGetPasswordResetUrlMutation();

  const handleResetConfirm = async () => {
    if (emailConfigured) {
      await resetPasswordEmail(user.email).unwrap();

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
            <Text pb="lg">{t`Share this link with the user. It will expire in 48 hours.`}</Text>
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
            <Text pb="lg">{t`Here's a temporary password they can use to log in and then change their password.`}</Text>
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
      <Flex direction="column" gap="lg" mt="md">
        <Text>{t`Are you sure you want to do this?`}</Text>
        <Flex align="center" justify="flex-end" gap="md">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            color="brand"
            onClick={handleGetResetLink}
          >{t`Get reset link`}</Button>
          <Button
            color="danger"
            variant="filled"
            onClick={handleResetConfirm}
          >{t`Reset password`}</Button>
        </Flex>
      </Flex>
    </Modal>
  );
};

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

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error}>
      {user && (
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
