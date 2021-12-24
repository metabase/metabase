import { trackStructEvent } from "metabase/lib/analytics";

export const trackPasswordReset = () => {
  trackStructEvent("Auth", "Password Reset");
};
