import { useMemo } from "react";
import { t } from "ttag";

import {
  useDeactivateUserMutation,
  useListUsersQuery,
  useReactivateUserMutation,
} from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";

interface UserActivationModalInnerProps {
  params: { userId: string };
  onClose: () => void;
}

// NOTE: we have to load the list of users because /api/user/:id doesn't return deactivated users
// but that's ok because it's probably already loaded through the people PeopleListingApp
export const UserActivationModal = ({
  params,
  onClose,
}: UserActivationModalInnerProps) => {
  const userId = parseInt(params.userId, 10);
  const { data } = useListUsersQuery({
    include_deactivated: true,
    tenancy: "all",
  });

  const user = useMemo(() => {
    const users = data?.data ?? [];
    return users.find((u) => u.id === userId);
  }, [data, userId]);

  const [deactivateUser] = useDeactivateUserMutation();
  const [reactivateUser] = useReactivateUserMutation();

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
        onConfirm={async () => {
          await deactivateUser(userId);
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
      onConfirm={async () => {
        await reactivateUser(userId);
        onClose();
      }}
    />
  );
};
