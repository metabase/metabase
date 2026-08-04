import { t } from "ttag";

import { BRANCH_KEY } from "../../constants";
import { useGitSyncVisible } from "../../hooks/use-git-sync-visible";
import { useRemoteSyncChanges } from "../../hooks/use-remote-sync-changes";

import { BranchSwitcher } from "./BranchSwitcher";
import { RemoteSyncSettingsSection } from "./RemoteSyncSettingsSection";
import { useGetAdminSettingsDetailsQuery } from "metabase/settings";

/**
 * Read-write branch switching, kept out of the everyday sync controls and behind guard rails because it
 * is rare and destructive. Read-only mode changes the branch via ReadOnlyBranchSection instead.
 */
export const BranchSwitcherSection = () => {
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
  const { data: dirtyData } = useRemoteSyncChanges();
  const { currentBranch } = useGitSyncVisible();

  const branchDetails = settingDetails?.[BRANCH_KEY];
  const isSetByEnv = !!branchDetails?.is_env_setting;

  return (
    <RemoteSyncSettingsSection
      title={t`Sync branch`}
      description={t`Choose which branch to sync with git.`}
    >
      <BranchSwitcher
        currentBranch={currentBranch}
        dirty={dirtyData?.dirty ?? []}
        disabled={isSetByEnv}
        envVarName={isSetByEnv ? branchDetails.env_name : undefined}
      />
    </RemoteSyncSettingsSection>
  );
};
