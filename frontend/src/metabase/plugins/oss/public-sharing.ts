import type React from "react";

const getDefaultPluginPublicSharing = () => ({
  PublicDocumentRoute: (_props: any) => null as React.ReactElement | null,
  PublicLinksDocumentListing: () => null as React.ReactElement | null,
});

export const PLUGIN_PUBLIC_SHARING = getDefaultPluginPublicSharing();

export function reinitialize() {
  Object.assign(PLUGIN_PUBLIC_SHARING, getDefaultPluginPublicSharing());
}
