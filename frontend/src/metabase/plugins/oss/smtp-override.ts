import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export const PLUGIN_SMTP_OVERRIDE: {
  CloudSMTPConnectionCard: ComponentType;
  SMTPOverrideConnectionForm: ComponentType<{ onClose: () => void }>;
} = {
  CloudSMTPConnectionCard: PluginPlaceholder,
  SMTPOverrideConnectionForm: PluginPlaceholder,
};
