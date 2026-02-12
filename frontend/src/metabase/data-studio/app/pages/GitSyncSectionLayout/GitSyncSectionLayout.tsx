import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { RemoteSyncUpsellPage } from "metabase/data-studio/upsells/pages";
import { usePageTitle } from "metabase/hooks/use-page-title";

export function GitSyncSectionLayout() {
  usePageTitle(t`Git sync`);
  const hasRemoteSyncFeature = useHasTokenFeature("remote_sync");

  if (!hasRemoteSyncFeature) {
    return <RemoteSyncUpsellPage />;
  }

  return null;
}
