import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ItemsListSection } from "metabase/bench/components/ItemsListSection/ItemsListSection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { Box, Flex, NavLink, Text } from "metabase/ui";
import { useListTransformJobsQuery } from "metabase-enterprise/api";
import type { JobListParams } from "metabase-enterprise/transforms/types";
import type { TransformJob } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { getJobUrl, getNewJobUrl } from "../../../urls";
import { parseTimestampWithTimezone } from "../../../utils";
import { hasFilterParams } from "../utils";

export function JobList({
  params,
  onCollapse,
}: {
  params: JobListParams;
  onCollapse: () => void;
}) {
  const systemTimezone = useSetting("system-timezone");
  const {
    data: jobs = [],
    isLoading,
    error,
  } = useListTransformJobsQuery({
    last_run_start_time: params.lastRunStartTime,
    last_run_statuses: params.lastRunStatuses,
    next_run_start_time: params.nextRunStartTime,
    tag_ids: params.tagIds,
  });
  const dispatch = useDispatch();

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ItemsListSection
      sectionTitle={t`Jobs`}
      onCollapse={onCollapse}
      onAddNewItem={() => dispatch(push(getNewJobUrl()))}
      listItems={
        jobs.length === 0 ? (
          <ListEmptyState
            label={hasFilterParams(params) ? t`No jobs found` : t`No jobs yet`}
          />
        ) : (
          jobs.map((job) => (
            <JobItem
              key={job.id}
              job={job}
              systemTimezone={systemTimezone ?? ""}
            />
          ))
        )
      }
    />
  );
}

const JobItem = ({
  job,
  systemTimezone,
}: {
  job: TransformJob;
  systemTimezone: string;
}) => {
  return (
    <NavLink
      component={Link}
      to={getJobUrl(job.id)}
      label={
        <Box>
          <Text fw="bold">{job.name}</Text>
          <Flex align="center" gap="sm">
            <Box
              bg={job.last_run?.status === "failed" ? "error" : "success"}
              px="sm"
              bdrs="sm"
            >
              <Text ff="monospace" fz="xs" opacity={1}>
                {job.last_run?.status}
              </Text>
            </Box>
            <Box c="text-medium" fz="sm">
              {job.last_run?.start_time
                ? parseTimestampWithTimezone(
                    job.last_run?.start_time,
                    systemTimezone,
                  ).format("lll")
                : null}
            </Box>
          </Flex>
        </Box>
      }
    />
  );
};

// type JobTransformCountProps = {
//   jobId: TransformJobId;
// };

/**
 * we shouldn't be making N+1 requests like this, we should hydrate it on the list endpoint if we want it
 */
// function JobTransformCount({ jobId }: JobTransformCountProps) {
//   const {
//     data = [],
//     isLoading,
//     error,
//   } = useListTransformJobTransformsQuery(jobId);
//   if (isLoading) {
//     return <Loader size="sm" />;
//   }
//   if (error != null) {
//     return <FixedSizeIcon name="warning" tooltip={getErrorMessage(error)} />;
//   }
//   return <>{data.length}</>;
// }
