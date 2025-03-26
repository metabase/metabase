import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateUserMutation } from "metabase/api";
import ModalContent from "metabase/components/ModalContent";
import Users from "metabase/entities/users";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { User } from "metabase-types/api";

import { UserForm } from "../forms/UserForm";

interface NewUserModalProps {
  onClose: () => void;
}

export const NewUserModal = ({ onClose }: NewUserModalProps) => {
  const dispatch = useDispatch();
  const [createUser] = useCreateUserMutation();

  const handleSubmit = async (vals: Partial<User>) => {
    if (!vals.email) {
      throw new Error("Email is required");
    }

    const newUser = await createUser({
      ...vals,
      first_name: vals.first_name ?? undefined,
      last_name: vals.last_name ?? undefined,
      login_attributes: vals.login_attributes ?? undefined,
      email: vals.email,
    }).unwrap();

    dispatch({
      type: Users.actionTypes.CREATE,
      payload: { user: newUser },
    });

    dispatch(push(Urls.newUserSuccess(newUser.id)));
  };

  return (
    <ModalContent title="Create user" onClose={onClose}>
      <UserForm
        initialValues={{}}
        submitText={t`Create`}
        onCancel={onClose}
        onSubmit={handleSubmit}
      />
    </ModalContent>
  );
};
