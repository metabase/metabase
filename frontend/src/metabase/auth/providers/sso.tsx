import type { AuthProvider } from "metabase/plugins/types";

import { SSOButton } from "../components/SSOButton";

export const ssoAuthProvider: AuthProvider = {
  name: "sso",
  Button: SSOButton,
};