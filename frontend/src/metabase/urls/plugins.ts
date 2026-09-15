import { definePluginSlot } from "metabase/plugins/slot";

export type HostNavigation = {
  /** Resolves to whether the host opened the link itself. */
  handleLink: (url: string) => Promise<boolean>;
};

export const PLUGIN_HOST_NAVIGATION = definePluginSlot(
  (): { host: HostNavigation | null } => ({ host: null }),
);
