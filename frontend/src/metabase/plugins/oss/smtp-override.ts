import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

import { definePluginSlot } from "../slot";

const getDefaultPluginSmtpOverride = () => ({
  CloudSMTPConnectionCard: PluginPlaceholder,
  SMTPOverrideConnectionForm: PluginPlaceholder,
});

export const PLUGIN_SMTP_OVERRIDE: {
  CloudSMTPConnectionCard: ComponentType;
  SMTPOverrideConnectionForm: ComponentType<{ onClose: () => void }>;
} = definePluginSlot(getDefaultPluginSmtpOverride);
