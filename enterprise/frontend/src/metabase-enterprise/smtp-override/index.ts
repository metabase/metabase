import { PLUGIN_SMTP_OVERRIDE } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  CloudSMTPConnectionCard,
  SMTPOverrideConnectionForm,
} from "./components";

/**
 * Initialize SMTP override plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("cloud_custom_smtp")) {
    PLUGIN_SMTP_OVERRIDE.CloudSMTPConnectionCard = CloudSMTPConnectionCard;
    PLUGIN_SMTP_OVERRIDE.SMTPOverrideConnectionForm =
      SMTPOverrideConnectionForm;
  }
}
