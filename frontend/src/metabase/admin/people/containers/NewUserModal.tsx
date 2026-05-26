import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateUserMutation } from "metabase/api";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { Modal } from "metabase/ui";
import * as Urls from "metabase/urls";
import { generatePassword } from "metabase/utils/password";
import MetabaseSettings from "metabase/utils/settings";
import type { User as UserType } from "metabase-types/api";

import { UserForm } from "../forms/UserForm";
import { storeTemporaryPassword } from "../people";

interface NewUserModalProps {
  onClose: () => void;
  external?: boolean;
}

export const NewUserModal = ({
  onClose,
  external = false,
}: NewUserModalProps) => {
  const dispatch = useDispatch();

  const [createUser] = useCreateUserMutation();

  const handleSubmit = async (vals: Partial<UserType>) => {
    const password = MetabaseSettings.isEmailConfigured()
      ? undefined
      : generatePassword();
    const user = await createUser({
      ...vals,
      email: vals.email ?? "",
      first_name: vals.first_name ?? undefined,
      last_name: vals.last_name ?? undefined,
      login_attributes: vals.login_attributes || undefined,
      ...(password ? { password } : {}),
    }).unwrap();

    if (password) {
      dispatch(storeTemporaryPassword({ id: user.id, password }));
    }
    dispatch(push(Urls.newUserSuccess(user)));
  };

  // Use plugin-provided title for external users, fallback to default
  const title = PLUGIN_TENANTS.getNewUserModalTitle(external) ?? t`Create user`;

  return (
    <Modal opened title={title} padding="xl" onClose={onClose}>
      <UserForm
        external={external}
        initialValues={{}}
        submitText={t`Create`}
        onCancel={onClose}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
};
