import { PLUGIN_PUBLIC_LINK_PASSWORDS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { PublicLinkPasswordSection } from "./PublicLinkPasswordSection";

export function initializePlugin() {
  if (hasPremiumFeature("public_link_passwords")) {
    Object.assign(PLUGIN_PUBLIC_LINK_PASSWORDS, {
      isEnabled: () => true,
      PasswordSection: PublicLinkPasswordSection,
    });
  }
}
