import { push } from "react-router-redux";
import { t } from "ttag";

import {
  ItemsListAddButton,
  ItemsListSection,
} from "metabase/bench/components/ItemsListSection/ItemsListSection";
import { BenchFlatListItem } from "metabase/bench/components/shared/BenchFlatListItem";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { useListTransformJobsQuery } from "metabase-enterprise/api";
import type { TransformJob, TransformJobId } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { getJobUrl, getNewJobUrl } from "../../../urls";
import { parseTimestampWithTimezone } from "../../../utils";

type JobListProps = {
  selectedId?: TransformJobId;
  onCollapse?: () => void;
};

export function JobList({ selectedId, onCollapse }: JobListProps) {
  const systemTimezone = useSetting("system-timezone");
  const { data: jobs = [], isLoading, error } = useListTransformJobsQuery({});
  const dispatch = useDispatch();

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ItemsListSection
      onCollapse={onCollapse}
      addButton={
        <ItemsListAddButton onClick={() => dispatch(push(getNewJobUrl()))} />
      }
      listItems={
        jobs.length === 0 ? (
          <ListEmptyState label={t`No jobs yet`} />
        ) : (
          jobs.map((job) => (
            <JobItem
              key={job.id}
              job={job}
              systemTimezone={systemTimezone ?? ""}
              isActive={selectedId === job.id}
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
  const subtitle =
    job.last_run?.start_time &&
    `${job.last_run?.status === "failed" ? t`Failed` : t`Last run`}: ${parseTimestampWithTimezone(
      job.last_run.start_time,
      systemTimezone,
    ).format("lll")}`;

  return (
    <BenchFlatListItem
      label={job.name}
      icon="play_outlined"
      subtitle={subtitle}
      href={getJobUrl(job.id)}
      isActive={isActive}
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
