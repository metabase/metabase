import { useValidatePassword } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { checkNotNull } from "metabase/utils/types";

import { UserPasswordForm } from "../../components/UserPasswordForm";

const UserPasswordApp = () => {
  const user = checkNotNull(useSelector(getUser));
  const validatePassword = useValidatePassword();
  return <UserPasswordForm user={user} onValidatePassword={validatePassword} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UserPasswordApp;
