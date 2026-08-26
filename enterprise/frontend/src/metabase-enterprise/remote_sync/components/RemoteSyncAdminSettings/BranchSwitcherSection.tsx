import { t } from "ttag";

import { useGetAdminSettingsDetailsQuery } from "metabase/settings";
import type { RemoteSyncEntity } from "metabase-types/api";

import { BRANCH_KEY } from "../../constants";
import { useGitSyncVisible } from "../../hooks/use-git-sync-visible";

import { BranchSwitcher } from "./BranchSwitcher";
import { RemoteSyncSettingsSection } from "./RemoteSyncSettingsSection";

type BranchSwitcherSectionProps = {
  dirty: RemoteSyncEntity[];
};

export const BranchSwitcherSection = ({
  dirty,
}: BranchSwitcherSectionProps) => {
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();
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
        dirty={dirty}
        disabled={isSetByEnv}
        envVarName={isSetByEnv ? branchDetails.env_name : undefined}
      />
    </RemoteSyncSettingsSection>
  );
};
