import { useMemo } from "react";
import type { Params } from "react-router/lib/Router";

import { useUserQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import Users from "metabase/entities/users";
import { useDispatch } from "metabase/lib/redux";
import type { User as UserType } from "metabase-types/api";

import { UserForm } from "../forms/UserForm";

interface EditUserModalProps {
  onClose: () => void;
  params: Params;
}

export const EditUserModal = ({ onClose, params }: EditUserModalProps) => {
  const dispatch = useDispatch();

  const { data: user, isLoading } = useUserQuery({
    id: parseInt(params.userId),
  });

  const initialValues = useMemo(() => getInitialValues(user), [user]);

  const handleSubmit = async (val: Partial<UserType>) => {
    await dispatch(Users.actions.update({ id: user?.id, ...val }));
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
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    email: user?.email,
    user_group_memberships: user?.user_group_memberships || [],
    login_attributes: user?.login_attributes || {},
  };
};
