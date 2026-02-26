import { PLUGIN_PUBLIC_SHARING } from "metabase/plugins";

import { ExpiryDisplay } from "./ExpiryDisplay";
import { ExpiryOption } from "./ExpiryOption";

export function initializePlugin() {
  PLUGIN_PUBLIC_SHARING.ExpiryOptionComponent = ExpiryOption;
  PLUGIN_PUBLIC_SHARING.ExpiryDisplayComponent = ExpiryDisplay;
  PLUGIN_PUBLIC_SHARING.isExpiringLinksEnabled = () => true;
}
