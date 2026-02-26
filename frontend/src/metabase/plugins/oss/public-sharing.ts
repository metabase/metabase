import type { ComponentType } from "react";

export interface ExpiryOptionProps {
  expiresInMinutes: number | null;
  onChangeExpiresInMinutes: (minutes: number | null) => void;
}

export interface ExpiryDisplayProps {
  expiresAt: string | null;
  expired: boolean;
}

const getDefaultPluginPublicSharing = () => ({
  ExpiryOptionComponent: null as ComponentType<ExpiryOptionProps> | null,
  ExpiryDisplayComponent: null as ComponentType<ExpiryDisplayProps> | null,
  isExpiringLinksEnabled: () => false,
});

export const PLUGIN_PUBLIC_SHARING = getDefaultPluginPublicSharing();

/** @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead. */
export function reinitialize() {
  Object.assign(PLUGIN_PUBLIC_SHARING, getDefaultPluginPublicSharing());
}
