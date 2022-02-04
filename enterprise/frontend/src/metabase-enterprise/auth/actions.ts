import { createThunkAction } from "metabase/lib/redux";
import { trackLoginSSO } from "./analytics";
import { getSSOUrl } from "./utils";

export const LOGIN_SSO = "metabase-enterprise/auth/LOGIN_SSO";
export const loginSSO = createThunkAction(
  LOGIN_SSO,
  (redirectUrl?: string) => async () => {
    trackLoginSSO();
    window.location.href = getSSOUrl(redirectUrl);
  },
);
