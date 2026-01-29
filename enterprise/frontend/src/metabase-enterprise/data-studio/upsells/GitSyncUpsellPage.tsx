import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { DataStudioUpsellPage } from "./DataStudioUpsellPage";

export function GitSyncUpsellPage() {
  usePageTitle(t`Git sync`);

  return (
    <DataStudioUpsellPage
      campaign="data-studio-git-sync"
      location="data-studio-git-sync-page"
      header={t`Git sync`}
      title={t`Sync your library with git`}
      description={t`Keep your library in sync with a git repository. Track changes, collaborate with your team, and maintain version history for your datasets and metrics.`}
    />
  );
}
