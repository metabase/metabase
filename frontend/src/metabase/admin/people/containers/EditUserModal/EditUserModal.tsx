import { useMemo } from "react";
import type { Params } from "react-router/lib/Router";

import { skipToken, useGetUserQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import Users from "metabase/entities/users";
import { useDispatch } from "metabase/lib/redux";
import type { User as UserType } from "metabase-types/api";

import { UserForm } from "../../forms/UserForm";

interface EditUserModalProps {
  onClose: () => void;
  params: Params;
}

export const EditUserModal = ({ onClose, params }: EditUserModalProps) => {
  const dispatch = useDispatch();
  const userId = params.userId ? parseInt(params.userId) : null;
  const { data: user, isLoading } = useGetUserQuery(userId ?? skipToken);

  const initialValues = useMemo(() => getInitialValues(user), [user]);

  const handleSubmit = async (newValues: Partial<UserType>) => {
    // first name and last name keys need to be present so they can
    // potentially be removed
    const submitValues = {
      first_name: null,
      last_name: null,
      ...newValues,
    };
    // can't use metabase/api hook here until the people list uses it too
    await dispatch(Users.actions.update({ id: user?.id, ...submitValues }));
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

const getInitialValues = (user?: UserType) => {
  return {
    first_name: user?.first_name,
    last_name: user?.last_name,
    email: user?.email,
    user_group_memberships: user?.user_group_memberships || [],
    login_attributes: user?.login_attributes || {},
  };
};
