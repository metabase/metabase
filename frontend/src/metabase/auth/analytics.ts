import { trackStructEvent } from "metabase/lib/analytics";

export const trackLogin = () => {
  trackStructEvent("Auth", "Login");
};

export const trackLoginGoogle = () => {
  trackStructEvent("Auth", "Google Auth Login");
};

export const trackLogout = () => {
  trackStructEvent("Auth", "Logout");
};

export const trackPasswordReset = () => {
  trackStructEvent("Auth", "Password Reset");
};
