import type { ComponentType } from "react";

import { definePluginSlot } from "metabase/plugin-slots";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginSmtpOverride = () => ({
  CloudSMTPConnectionCard: PluginPlaceholder,
  SMTPOverrideConnectionForm: PluginPlaceholder,
});

export const PLUGIN_SMTP_OVERRIDE: {
  CloudSMTPConnectionCard: ComponentType;
  SMTPOverrideConnectionForm: ComponentType<{ onClose: () => void }>;
} = definePluginSlot(getDefaultPluginSmtpOverride);
