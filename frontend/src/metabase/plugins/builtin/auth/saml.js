import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";

PLUGIN_IS_PASSWORD_USER.push(user => user.sso_source !== "saml");
