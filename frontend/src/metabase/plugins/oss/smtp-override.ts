import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginSmtpOverride = () => ({
  CloudSMTPConnectionCard: PluginPlaceholder,
  SMTPOverrideConnectionForm: PluginPlaceholder,
});

export const PLUGIN_SMTP_OVERRIDE: {
  CloudSMTPConnectionCard: ComponentType;
  SMTPOverrideConnectionForm: ComponentType<{ onClose: () => void }>;
} = getDefaultPluginSmtpOverride();

export function reinitialize() {
  Object.assign(PLUGIN_SMTP_OVERRIDE, getDefaultPluginSmtpOverride());
}
