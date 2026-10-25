import { useSetting } from "metabase/settings";

import { getShouldShowTransformPermissions } from "../../utils/data-permissions/permission-editor";

export function useShouldShowTransformPermissions() {
  const tokenFeatures = useSetting("token-features");
  const isHosted = useSetting("is-hosted?");
  const isTransformsEnabled = useSetting("transforms-enabled");

  return getShouldShowTransformPermissions({
    tokenFeatures,
    isHosted,
    isTransformsEnabled,
  });
}
