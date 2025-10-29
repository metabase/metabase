import { push } from "react-router-redux";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Card, FixedSizeIcon, Flex, Loader } from "metabase/ui";
import {
  useListTransformJobTransformsQuery,
  useListTransformJobsQuery,
  useListTransformTagsQuery,
} from "metabase-enterprise/api";
import { TimezoneIndicator } from "metabase-enterprise/transforms/components/TimezoneIndicator";
import type { TransformJob, TransformJobId } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { RunStatusInfo } from "../../../components/RunStatusInfo";
import { TagList } from "../../../components/TagList";
import { parseTimestampWithTimezone } from "../../../utils";
import { hasFilterParams } from "../utils";

import S from "./JobList.module.css";

type JobListProps = {
  params: Urls.TransformJobListParams;
};

export function JobList({ params }: JobListProps) {
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
    dispatch(push(Urls.transformJob(job.id)));
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
    <Card p={0} shadow="none" withBorder>
      <AdminContentTable
        columnTitles={[
          t`Job`,
          <Flex align="center" gap="xs" key="last-run-at">
            <span className={S.nowrap}>{t`Last run at`}</span>{" "}
            <TimezoneIndicator />
          </Flex>,
          <span key="last-run-status" className={S.nowrap}>
            {t`Last run status`}
          </span>,
          <Flex align="center" gap="xs" key="next-run">
            <span className={S.nowrap}>{t`Next run at`}</span>{" "}
            <TimezoneIndicator />
          </Flex>,
          t`Transforms`,
          t`Tags`,
        ]}
      >
        {jobs.map((job) => (
          <tr
            key={job.id}
            className={S.row}
            onClick={() => handleRowClick(job)}
          >
            <td className={S.wrap}>{job.name}</td>
            <td className={S.nowrap}>
              {job.last_run?.start_time
                ? parseTimestampWithTimezone(
                    job.last_run?.start_time,
                    systemTimezone,
                  ).format("lll")
                : null}
            </td>
            <td className={S.nowrap}>
              {job.last_run != null ? (
                <RunStatusInfo
                  status={job.last_run.status}
                  message={job.last_run.message}
                  endTime={
                    job.last_run.end_time != null
                      ? parseTimestampWithTimezone(
                          job.last_run.end_time,
                          systemTimezone,
                        ).toDate()
                      : null
                  }
                />
              ) : null}
            </td>
            <td className={S.nowrap}>
              {job.next_run?.start_time
                ? parseTimestampWithTimezone(
                    job.next_run?.start_time,
                    systemTimezone,
                  ).format("lll")
                : null}
            </td>
            <td className={S.nowrap}>
              <JobTransformCount jobId={job.id} />
            </td>
            <td className={S.wrap}>
              <TagList tags={tags} tagIds={job.tag_ids ?? []} />
            </td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}

type JobTransformCountProps = {
  jobId: TransformJobId;
};

function JobTransformCount({ jobId }: JobTransformCountProps) {
  const {
    data = [],
    isLoading,
    error,
  } = useListTransformJobTransformsQuery(jobId);
  if (isLoading) {
    return <Loader size="sm" />;
  }
  if (error != null) {
    return <FixedSizeIcon name="warning" tooltip={getErrorMessage(error)} />;
  }
  return <>{data.length}</>;
}
