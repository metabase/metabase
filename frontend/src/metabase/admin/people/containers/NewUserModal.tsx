import { push } from "react-router-redux";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { useDispatch } from "metabase/lib/redux";
import ModalContent from "metabase/components/ModalContent";

import User from "metabase/entities/users";
import type { User as UserType } from "metabase-types/api";
import { UserForm } from "../forms/UserForm";

interface NewUserModalProps {
  onClose: () => void;
}

export const NewUserModal = ({ onClose }: NewUserModalProps) => {
  const dispatch = useDispatch();

  const handleSubmit = async (vals: Partial<UserType>) => {
    const {
      payload: { id: userId },
    } = await dispatch(User.actions.create(vals));

    await dispatch(push(Urls.newUserSuccess(userId)));
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
