import type React from "react";

const getDefaultPluginPublicSharing = () => ({
  PublicDocumentRoute: (_props: any) => null as React.ReactElement | null,
  PublicLinksDocumentListing: () => null as React.ReactElement | null,
});

export const PLUGIN_PUBLIC_SHARING = getDefaultPluginPublicSharing();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_PUBLIC_SHARING, getDefaultPluginPublicSharing());
}
