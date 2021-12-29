import Settings from "metabase/lib/settings";
import { createThunkAction } from "metabase/lib/redux";

export const LOGIN_SSO = "metabase-enterprise/auth/LOGIN_SSO";
export const loginSSO = createThunkAction(
  LOGIN_SSO,
  (redirectUrl?: string) => async () => {
    const url = new URL(Settings.get("site-url"));
    url.pathname = "/auth/sso";

    if (redirectUrl) {
      url.searchParams.set("redirect", redirectUrl);
    }

    window.location.href = url.href;
  },
);
