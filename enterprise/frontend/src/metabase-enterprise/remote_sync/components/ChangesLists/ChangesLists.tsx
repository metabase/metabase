import { t } from "ttag";

import { Box, Loader, Text } from "metabase/ui";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";

import { AllChangesView } from "./AllChangesView";

interface ChangesListsProps {
  title?: string;
}

export const ChangesLists = ({ title }: ChangesListsProps) => {
  const { data: dirtyData, isLoading: isLoadingChanges } =
    useGetRemoteSyncChangesQuery(undefined, {
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
    });

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
        <Text c="text-tertiary" size="sm">
          {t`No changes to push`}
        </Text>
      </Box>
    );
  }

  return <AllChangesView entities={allEntities} title={title} />;
};
