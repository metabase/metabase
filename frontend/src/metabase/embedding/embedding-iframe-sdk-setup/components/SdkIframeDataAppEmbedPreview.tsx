import { t } from "ttag";

import { getEmbeddedAppNameFromPath } from "embedding-sdk-shared/lib/embedded-data-app-path";
import { getCurrentMetabaseInstanceUrl } from "embedding-sdk-shared/lib/get-current-metabase-instance-url";
import { DATA_APP_EMBED_PREFIX } from "metabase/urls/data-apps";

export const SdkIframeDataAppEmbedPreview = ({
  path,
  onLoad,
}: {
  path: string;
  onLoad: () => void;
}) => {
  const name = getEmbeddedAppNameFromPath(path);

  if (!name) {
    return null;
  }

  // We can't use embed.js as it only allows SSO auth, not current user session.
  // We force the iframe to load the data app directly for embed wizard preview.
  const instanceUrl = getCurrentMetabaseInstanceUrl();
  const src = `${instanceUrl}${DATA_APP_EMBED_PREFIX}/${encodeURIComponent(name)}`;

  return (
    <iframe
      title={t`Data app preview`}
      allow="clipboard-write"
      src={src}
      onLoad={onLoad}
      style={{ width: "100%", height: "100%", border: 0 }}
    />
  );
};
