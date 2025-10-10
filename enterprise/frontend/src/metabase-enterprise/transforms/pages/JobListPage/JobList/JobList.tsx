import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ItemsListSection } from "metabase/bench/components/ItemsListSection/ItemsListSection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { Box, Flex, NavLink, Text } from "metabase/ui";
import {

  useListTransformJobsQuery,
  useListTransformTagsQuery,
} from "metabase-enterprise/api";
import type { JobListParams } from "metabase-enterprise/transforms/types";
import type { TransformJob } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { getJobUrl } from "../../../urls";
import { parseTimestampWithTimezone } from "../../../utils";
import { hasFilterParams } from "../utils";


export function JobList({ params, onCollapse }: { params: JobListParams, onCollapse: () => void }) {
  const systemTimezone = useSetting("system-timezone");
  const {
    data: jobs = [],
    isLoading: isLoadingJobs,
    error: jobsError,
  } = useListTransformJobsQuery({
    last_run_start_time: params.lastRunStartTime,
    last_run_statuses: params.lastRunStatuses,
    next_run_start_time: params.nextRunStartTime,
    tag_ids: params.tagIds,
  });
  const {
    data: tags = [],
    isLoading: isLoadingTags,
    error: tagsError,
  } = useListTransformTagsQuery();
  const isLoading = isLoadingJobs || isLoadingTags;
  const error = jobsError ?? tagsError;
  const dispatch = useDispatch();

  const handleRowClick = (job: TransformJob) => {
    dispatch(push(getJobUrl(job.id)));
  };

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (jobs.length === 0) {
    const hasFilters = hasFilterParams(params);
    return (
      <ListEmptyState label={hasFilters ? t`No jobs found` : t`No jobs yet`} />
    );
  }

  return (
    <ItemsListSection
      sectionTitle={t`Jobs`}
      onCollapse={onCollapse}
      listItems={
        jobs.map((job) => (
          <JobItem key={job.id} job={job} systemTimezone={systemTimezone ?? ''} />
        ))
      }
    />
  );
}

const JobItem = ({ job, systemTimezone }: { job: TransformJob; systemTimezone: string }) => {
  return (
    <NavLink
      component={Link}
      to={getJobUrl(job.id)}
      label={(
        <Box>
          <Text fw="bold">{job.name}</Text>
          <Flex align="center" gap="sm">
            <Box bg={job.last_run?.status === "failed" ? "error" : "success"} px="sm" bdrs="sm">
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
      )}
    />
  );
}

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
