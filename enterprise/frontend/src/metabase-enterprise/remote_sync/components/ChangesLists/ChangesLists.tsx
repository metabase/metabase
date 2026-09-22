import { t } from "ttag";

import { Box, Loader, Text } from "metabase/ui";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";

import { AllChangesView } from "./AllChangesView";

interface ChangesListsProps {
  title?: string;
  /** undefined is the main app */
  worktreeId?: number;
}

export const ChangesLists = ({ title, worktreeId }: ChangesListsProps) => {
  const { data: dirtyData, isLoading: isLoadingChanges } =
    useGetRemoteSyncChangesQuery(
      worktreeId == null ? undefined : { "worktree-id": worktreeId },
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
      <Box ta="center" py="xxl">
        <Text c="text-disabled" size="sm">
          {t`No changes to push`}
        </Text>
      </Box>
    );
  }

  return <AllChangesView entities={allEntities} title={title} />;
};
