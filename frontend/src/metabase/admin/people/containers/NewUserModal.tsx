import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateUserMutation } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { generatePassword } from "metabase/lib/security";
import MetabaseSettings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Modal } from "metabase/ui";
import type { User as UserType } from "metabase-types/api";

import { UserForm } from "../forms/UserForm";

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
    const user = await createUser({
      ...vals,
      email: vals.email ?? "",
      first_name: vals.first_name ?? undefined,
      last_name: vals.last_name ?? undefined,
      login_attributes: vals.login_attributes || undefined,
      ...(MetabaseSettings.isEmailConfigured()
        ? {}
        : { password: generatePassword() }),
    }).unwrap();

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
