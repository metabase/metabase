import { useUnmount } from "react-use";
import { c, t } from "ttag";

import {
  useForgotPasswordMutation,
  useGetUserQuery,
  useUpdatePasswordMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PasswordReveal } from "metabase/common/components/PasswordReveal";
import { useToast } from "metabase/common/hooks/use-toast";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { generatePassword } from "metabase/lib/security";
import MetabaseSettings from "metabase/lib/settings";
import { Text } from "metabase/ui";
import type { User } from "metabase-types/api";

import { clearTemporaryPassword } from "../people";
import { getUserTemporaryPassword } from "../selectors";

interface UserPasswordResetModalProps {
  clearTemporaryPassword: () => void;
  onClose: () => void;
  user: User;
  emailConfigured: boolean;
  temporaryPassword: string;
}

const UserPasswordResetModalInner = ({
  clearTemporaryPassword,
  emailConfigured,
  onClose,
  temporaryPassword,
  user,
}: UserPasswordResetModalProps) => {
  useUnmount(() => {
    clearTemporaryPassword();
  });

  const [sendToast] = useToast();
  const [updatePassword] = useUpdatePasswordMutation();
  const [resetPasswordEmail] = useForgotPasswordMutation();

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
    }
  };

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
            <Text pb="lg">{t`Here’s a temporary password they can use to log in and then change their password.`}</Text>
            <PasswordReveal password={temporaryPassword} />
          </>
        }
      />
    );
  }

  return (
    <ConfirmModal
      opened
      title={t`Reset ${user.common_name}'s password?`}
      onClose={onClose}
      confirmButtonText={t`Reset password`}
      onConfirm={handleResetConfirm}
      message={t`Are you sure you want to do this?`}
    />
  );
};

interface UserPasswordResetModalProps {
  params: { userId: string };
  onClose: () => void;
}

export const UserPasswordResetModal = (props: UserPasswordResetModalProps) => {
  const userId = parseInt(props.params.userId);

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
          user={user}
          emailConfigured={MetabaseSettings.isEmailConfigured()}
          temporaryPassword={temporaryPassword}
        />
      )}
    </LoadingAndErrorWrapper>
  );
};
