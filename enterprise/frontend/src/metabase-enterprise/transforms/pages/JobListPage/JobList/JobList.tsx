import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ItemsListSection } from "metabase/bench/components/ItemsListSection/ItemsListSection";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { Box, FixedSizeIcon, Indicator, NavLink, Text } from "metabase/ui";
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
  // TODO: Pretty sure `JobListParams` was meant to be the `query` type?
  params: JobListParams & { jobId?: string };
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
              isActive={!!params.jobId && +params.jobId === job.id}
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
  isActive,
}: {
  job: TransformJob;
  systemTimezone: string;
  isActive?: boolean;
}) => {
  return (
    <NavLink
      component={Link}
      to={getJobUrl(job.id)}
      active={isActive}
      bdrs="lg"
      leftSection={
        <Indicator
          offset={4}
          disabled={job.last_run?.status !== "failed"}
          color="error"
          p="0.75rem"
          bg="brand-lighter"
          bdrs="lg"
          pos="relative"
          display="flex"
        >
          <FixedSizeIcon name="clock" size={24} c="brand" />
        </Indicator>
      }
      label={
        <Box style={{ overflow: "hidden" }}>
          <Text fw="bold">{job.name}</Text>
          {job.last_run?.start_time && (
            <Ellipsified
              ff="monospace"
              fz="xs"
              c="text-secondary"
              showTooltip={false}
            >
              {job.last_run?.status === "failed" ? t`Failed` : t`Last run`}
              {": "}
              {parseTimestampWithTimezone(
                job.last_run.start_time,
                systemTimezone,
              ).format("lll")}
            </Ellipsified>
          )}
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
