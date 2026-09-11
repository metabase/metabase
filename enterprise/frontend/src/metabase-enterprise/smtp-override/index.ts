import { PLUGIN_SMTP_OVERRIDE, lazyPluginComponent } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

const smtpOverride = () => import("./components");

/**
 * Initialize SMTP override plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("cloud_custom_smtp")) {
    PLUGIN_SMTP_OVERRIDE.CloudSMTPConnectionCard = lazyPluginComponent(() =>
      smtpOverride().then(
        ({ CloudSMTPConnectionCard }) => CloudSMTPConnectionCard,
      ),
    );
    PLUGIN_SMTP_OVERRIDE.SMTPOverrideConnectionForm = lazyPluginComponent(() =>
      smtpOverride().then(
        ({ SMTPOverrideConnectionForm }) => SMTPOverrideConnectionForm,
      ),
    );
  }
}
