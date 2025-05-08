import { t } from "ttag";
import _ from "underscore";

import { ConfirmModal } from "metabase/components/ConfirmModal";
import Users from "metabase/entities/users";
import { connect } from "metabase/lib/redux";
import type { User } from "metabase-types/api";

interface UserActivationModalInnerProps {
  user: User & {
    reactivate: () => void | Promise<void>;
    deactivate: () => void | Promise<void>;
  };
  onClose: () => void;
}

// NOTE: we have to load the list of users because /api/user/:id doesn't return deactivated users
// but that's ok because it's probably already loaded through the people PeopleListingApp
const UserActivationModalInner = ({
  user,
  onClose,
}: UserActivationModalInnerProps) => {
  if (!user) {
    return null;
  }

  if (user.is_active) {
    return (
      <ConfirmModal
        opened
        title={t`Deactivate ${user.common_name}?`}
        message={t`${user.common_name} won't be able to log in anymore.`}
        confirmButtonText={t`Deactivate`}
        onClose={onClose}
        onConfirm={() => {
          user.deactivate();
          onClose();
        }}
      />
    );
  }

  return (
    <ConfirmModal
      opened
      title={t`Reactivate ${user.common_name}?`}
      message={t`They'll be able to log in again, and they'll be placed back into the groups they were in before their account was deactivated.`}
      confirmButtonText={t`Reactivate`}
      onClose={onClose}
      onConfirm={() => {
        user.reactivate();
        onClose();
      }}
    />
  );
};

export const UserActivationModal = _.compose(
  Users.loadList({
    query: { include_deactivated: true },
    wrapped: true,
  }),
  connect(
    (
      _state,
      {
        users,
        params: { userId },
      }: {
        users: User[];
        params: { userId: string };
      },
    ) => ({ user: _.findWhere(users, { id: parseInt(userId) }) }),
  ),
)(UserActivationModalInner);
