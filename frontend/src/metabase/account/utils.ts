import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import type { User } from "metabase-types/api";

export function isPasswordUser(user: User) {
  const userToCheck =
    user.has_used_password === true ? { ...user, sso_source: null } : user;
  return PLUGIN_IS_PASSWORD_USER.every((predicate) => predicate(userToCheck));
}
