import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import type { MfaEnforcement, User } from "metabase-types/api";

export function hasAuthenticationSettings(
  user: User,
  mfaEnforcement: MfaEnforcement | undefined,
) {
  return (
    PLUGIN_IS_PASSWORD_USER.every((predicate) => predicate(user)) ||
    user.slack_account_status != null ||
    (mfaEnforcement != null &&
      mfaEnforcement !== "off" &&
      user.sso_source === "ldap")
  );
}
