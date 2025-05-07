import { useMemo } from "react";
import type { Params } from "react-router/lib/Router";
import { t } from "ttag";

import {
  skipToken,
  useGetUserQuery,
  useUpdateUserMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Modal } from "metabase/ui";
import type { User } from "metabase-types/api";

import { UserForm } from "../../forms/UserForm";

interface EditUserModalProps {
  onClose: () => void;
  params: Params;
  external?: boolean;
}

export const EditUserModal = ({
  onClose,
  params,
  external = false,
}: EditUserModalProps) => {
  const userId = params.userId ? parseInt(params.userId) : null;
  const { data: user, isLoading, error } = useGetUserQuery(userId ?? skipToken);
  const [updateUser] = useUpdateUserMutation();

  const initialValues = useMemo(
    () => ({
      first_name: user?.first_name,
      last_name: user?.last_name,
      email: user?.email,

      login_attributes: user?.login_attributes || {},
      user_group_memberships: user?.user_group_memberships || [],

      ...(external
        ? { tenant_id: user?.tenant_id }
        : { user_group_memberships: user?.user_group_memberships || [] }),
    }),
    [user, external],
  );

  const handleSubmit = async (newValues: Partial<User>) => {
    if (userId == null) {
      return;
    }

    // first name and last name keys need to be present, so they can potentially be removed
    const defaultValues = { id: userId, first_name: null, last_name: null };
    const updatedUser = { ...defaultValues, ...newValues };
    await updateUser(updatedUser).unwrap();

    onClose();
  };

  return (
    <Modal opened title={t`Edit user`} padding="xl" onClose={onClose}>
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <UserForm
          onCancel={onClose}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          external={external}
          userId={userId}
          edit
        />
      </LoadingAndErrorWrapper>
    </Modal>
  );
};
