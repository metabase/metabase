import { isLoopbackHostname } from "metabase/utils/dom";

export const getIsLocalhost = () =>
  isLoopbackHostname(window.location.hostname);
