import { getIsSsoUser } from "metabase/account/selectors";
import { useValidatePassword } from "metabase/common/hooks";
import { getUser } from "metabase/current-user";
import { PLUGIN_MULTI_FACTOR_AUTH } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Stack } from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";

import { UserPasswordForm } from "../../components/UserPasswordForm";

const UserPasswordApp = () => {
  const user = checkNotNull(useSelector(getUser));
  const isSsoUser = useSelector(getIsSsoUser);
  const validatePassword = useValidatePassword();

  return (
    <Stack gap="xl">
      {!isSsoUser && (
        <Stack gap="md">
          <UserPasswordForm user={user} onValidatePassword={validatePassword} />
        </Stack>
      )}
      <PLUGIN_MULTI_FACTOR_AUTH.AccountSecurityPanel />
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UserPasswordApp;
