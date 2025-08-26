import { useState } from "react";
import { t } from "ttag";

import { useUserSetting } from "metabase/common/hooks";
import { Icon, Tooltip, UnstyledButton } from "metabase/ui";
import { useListGitBranchesQuery } from "metabase-enterprise/api/git-sync";

import { ViewChangesModal } from "./ViewChangesModal";

export const ViewChangesButton = () => {
  const [currentBranch] = useUserSetting("git-branch", {
    shouldDebounce: false,
  });
  const [modalOpened, setModalOpened] = useState(false);
  const { data: branches = [] } = useListGitBranchesQuery();

  const defaultBranch = branches.find((b) => !b.parent_branch_id);

  const displayBranch = currentBranch || defaultBranch?.name;

  if (displayBranch === defaultBranch?.name) {
    return null;
  }

  return (
    <>
      <Tooltip label={t`Compare changes`}>
        <UnstyledButton
          onClick={() => setModalOpened(true)}
          style={{ minWidth: 0 }}
        >
          <Icon
            name="git_compare"
            size={16}
            color="text-dark"
            style={{ cursor: "pointer" }}
          />
        </UnstyledButton>
      </Tooltip>

      <ViewChangesModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        currentBranch={displayBranch}
      />
    </>
  );
};
