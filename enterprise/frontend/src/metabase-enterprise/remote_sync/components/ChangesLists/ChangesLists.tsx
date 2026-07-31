import { t } from "ttag";

import { Box, Loader, Text } from "metabase/ui";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

import { AllChangesView } from "./AllChangesView";

interface ChangesListsProps {
  title?: string;
  /** Show a worktree's changes instead of the main app's. */
  worktreeId?: RemoteSyncWorktreeId;
}

export const ChangesLists = ({ title, worktreeId }: ChangesListsProps) => {
  const { data: dirtyData, isLoading: isLoadingChanges } =
    useGetRemoteSyncChangesQuery(
      worktreeId != null ? { worktree_id: worktreeId } : undefined,
      {
        refetchOnMountOrArgChange: true,
        refetchOnFocus: true,
      },
    );

  if (isLoadingChanges) {
    return (
      <Box>
        <Loader size="sm" />
      </Box>
    );
  }

  const allEntities = dirtyData?.dirty || [];

  if (allEntities.length === 0) {
    return (
      <Box ta="center" py="xl">
        <Text c="text-disabled" size="sm">
          {t`No changes to push`}
        </Text>
      </Box>
    );
  }

  return <AllChangesView entities={allEntities} title={title} />;
};
