import { t } from "ttag";

import { useCreateUserMutation } from "metabase/api";
import { isEmailAlreadyInUse } from "metabase/api/utils/errors";
import { trackUserInvited } from "metabase/common/analytics";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
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
    try {
      const user = await createUser({
        ...vals,
        email: vals.email ?? "",
        first_name: vals.first_name ?? undefined,
        last_name: vals.last_name ?? undefined,
        login_attributes: vals.login_attributes || undefined,
        ...(password ? { password } : {}),
      }).unwrap();

      // External (tenant) creates send no invite email, so skip tracking.
      if (!external) {
        trackUserInvited({
          triggeredFrom: "admin",
          targetId: null,
          result: "success",
          eventDetail: "new_user",
        });
      }
      if (password) {
        dispatch(storeTemporaryPassword({ id: user.id, password }));
      }
      dispatch(push(Urls.newUserSuccess(user)));
    } catch (error) {
      if (!external) {
        trackUserInvited({
          triggeredFrom: "admin",
          targetId: null,
          result: "failure",
          eventDetail: isEmailAlreadyInUse(error) ? "existing_user" : null,
        });
      }
      throw error;
    }
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
