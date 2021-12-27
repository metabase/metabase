import { trackStructEvent } from "metabase/lib/analytics";

export const trackLogout = () => {
  trackStructEvent("Auth", "Logout");
};

export const trackPasswordReset = () => {
  trackStructEvent("Auth", "Password Reset");
};
