import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import type { MfaEnforcement, User } from "metabase-types/api";

export function isPasswordUser(user: User) {
  const userToCheck =
    user.has_used_password === true ? { ...user, sso_source: null } : user;
  return PLUGIN_IS_PASSWORD_USER.every((predicate) => predicate(userToCheck));
}

export function hasAuthenticationSettings(
  user: User,
  mfaEnforcement: MfaEnforcement | undefined,
) {
  return (
    isPasswordUser(user) ||
    user.slack_account_status != null ||
    (mfaEnforcement != null &&
      mfaEnforcement !== "off" &&
      user.sso_source === "ldap")
  );
}
