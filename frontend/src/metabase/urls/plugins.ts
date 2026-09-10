import { definePluginSlot } from "metabase/plugin-slots";

export type HostNavigation = {
  /** Resolves to whether the host opened the link itself. */
  handleLink: ((url: string) => Promise<boolean>) | null;
  sameOriginTarget: "_self" | "_blank";
};

export const PLUGIN_HOST_NAVIGATION = definePluginSlot(
  (): { host: HostNavigation | null } => ({ host: null }),
);
