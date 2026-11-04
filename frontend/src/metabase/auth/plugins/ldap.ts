import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";

PLUGIN_IS_PASSWORD_USER.push(
  (user) => user.has_password === true || user.sso_source !== "ldap",
);
