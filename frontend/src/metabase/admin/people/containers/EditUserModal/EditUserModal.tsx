import { useMemo } from "react";
import type { Params } from "react-router/lib/Router";

import {
  skipToken,
  useGetUserQuery,
  useUpdateUserMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import type { User } from "metabase-types/api";

import { UserForm } from "../../forms/UserForm";

interface EditUserModalProps {
  onClose: () => void;
  params: Params;
}

export const EditUserModal = ({ onClose, params }: EditUserModalProps) => {
  const userId = params.userId ? parseInt(params.userId) : null;
  const { data: user, isLoading } = useGetUserQuery(userId ?? skipToken);
  const [updateUser] = useUpdateUserMutation();
  const initialValues = useMemo(() => getInitialValues(user), [user]);

  const handleSubmit = async (newValues: Partial<User>) => {
    if (userId == null) {
      return;
    }

    // first name and last name keys need to be present, so they can potentially be removed
    await updateUser({
      id: userId,
      first_name: null,
      last_name: null,
      ...newValues,
    }).unwrap();

    onClose();
  };

  return (
    <ModalContent title="Edit user" onClose={onClose}>
      <LoadingAndErrorWrapper loading={isLoading}>
        {() => {
          return (
            <UserForm
              onCancel={onClose}
              initialValues={initialValues}
              onSubmit={handleSubmit}
            />
          );
        }}
      </LoadingAndErrorWrapper>
    </ModalContent>
  );
};

const getInitialValues = (user?: User) => {
  return {
    first_name: user?.first_name,
    last_name: user?.last_name,
    email: user?.email,
    user_group_memberships: user?.user_group_memberships || [],
    login_attributes: user?.login_attributes || {},
  };
};
