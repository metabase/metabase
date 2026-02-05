import { t } from "ttag";

import { DataStudioUpsellPage } from "./DataStudioUpsellPage";

export function GitSyncUpsellPage() {
  return (
    <DataStudioUpsellPage
      campaign="data-studio-git-sync"
      location="data-studio-git-sync-page"
      title={t`Sync your library with git`}
      description={t`Keep your library in sync with a git repository. Track changes, collaborate with your team, and maintain version history for your datasets and metrics.`}
    />
  );
}
