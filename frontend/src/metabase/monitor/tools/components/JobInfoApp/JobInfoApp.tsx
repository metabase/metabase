import { useGetTasksInfoQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Center, Stack } from "metabase/ui";

import { JobsTable } from "./JobsTable";

/**
 * The scheduler's jobs. Rendered by the "Scheduled tasks" tab of the
 * Background tasks page, which also shows the trigger sidebar for a job.
 */
export const ScheduledJobs = () => {
  const { data, error, isLoading, isFetching } = useGetTasksInfoQuery();

  if (error != null) {
    return (
      <Center flex={1}>
        <DelayedLoadingAndErrorWrapper loading={isFetching} error={error} />
      </Center>
    );
  }

  // a Stack, not a fragment: the table card shrinks to fit a flex column, so
  // on its own it would scroll inside itself instead of letting the page scroll
  return (
    <Stack gap="md">
      <JobsTable
        jobs={data?.jobs ?? []}
        isFetching={isFetching}
        isLoading={isLoading}
      />
    </Stack>
  );
};
