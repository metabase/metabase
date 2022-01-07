import { trackStructEvent } from "metabase/lib/analytics";

export const trackLoginSSO = () => {
  trackStructEvent("Auth", "SSO Login Start");
};
