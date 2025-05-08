import { goBack } from "react-router-redux";
import { useUnmount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { ConfirmModal } from "metabase/components/ConfirmModal";
import PasswordReveal from "metabase/components/PasswordReveal";
import Users from "metabase/entities/users";
import { connect } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { Text } from "metabase/ui";
import type { User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { clearTemporaryPassword } from "../people";
import { getUserTemporaryPassword } from "../selectors";

interface UserPasswordResetModalParams {
  params: { userId: string };
}

interface UserPasswordResetModalProps extends UserPasswordResetModalParams {
  clearTemporaryPassword: (userId: string) => void;
  onClose: () => void;
  user: User & {
    resetPasswordEmail: () => Promise<void>;
    resetPasswordManual: () => Promise<void>;
  };
  emailConfigured: boolean;
  temporaryPassword: string;
}

const UserPasswordResetModalInner = ({
  clearTemporaryPassword,
  emailConfigured,
  onClose,
  params,
  temporaryPassword,
  user,
}: UserPasswordResetModalProps) => {
  useUnmount(() => {
    clearTemporaryPassword(params.userId);
  });

  const handleResetConfirm = async () => {
    if (emailConfigured) {
      await user.resetPasswordEmail();
    } else {
      await user.resetPasswordManual();
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

export const UserPasswordResetModal = _.compose(
  Users.load({
    id: (_state: State, props: UserPasswordResetModalParams) =>
      props.params.userId,
    wrapped: true,
  }),
  connect(
    (state, props: UserPasswordResetModalParams) => ({
      emailConfigured: MetabaseSettings.isEmailConfigured(),
      temporaryPassword: getUserTemporaryPassword(state, {
        userId: props.params.userId,
      }),
    }),
    {
      onClose: goBack,
      clearTemporaryPassword,
    },
  ),
)(UserPasswordResetModalInner);
