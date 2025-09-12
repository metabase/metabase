import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { Card, Flex } from "metabase/ui";
import {
  useListTransformJobsQuery,
  useListTransformTagsQuery,
} from "metabase-enterprise/api";
import { TimezoneIndicator } from "metabase-enterprise/transforms/components/TimezoneIndicator";
import type { JobListParams } from "metabase-enterprise/transforms/types";
import type { TransformJob } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { TagList } from "../../../components/TagList";
import { getJobUrl } from "../../../urls";
import { parseTimestampWithTimezone } from "../../../utils";

import S from "./JobList.module.css";

export function JobList({ params }: { params: JobListParams }) {
  const systemTimezone = useSetting("system-timezone");
  const {
    data: jobs = [],
    isLoading: isLoadingJobs,
    error: jobsError,
  } = useListTransformJobsQuery({
    last_run_start_time: params.lastRunStartTime,
    next_run_start_time: params.nextRunStartTime,
    transform_tag_ids: params.transformTagIds,
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
    return <ListEmptyState label={t`No jobs yet`} />;
  }

  return (
    <Card p={0} shadow="none" withBorder>
      <AdminContentTable
        columnTitles={[
          t`Job`,
          <Flex align="center" gap="xs" key="last-run-at">
            {t`Last run at`} <TimezoneIndicator />
          </Flex>,
          <Flex align="center" gap="xs" key="next-run">
            {t`Next run`} <TimezoneIndicator />
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
            <td>{job.name}</td>
            <td className={S.nowrap}>
              {job.last_run?.start_time
                ? parseTimestampWithTimezone(
                    job.last_run?.start_time,
                    systemTimezone,
                  ).format("lll")
                : null}
            </td>
            <td className={S.nowrap}>
              {job.next_run?.start_time
                ? parseTimestampWithTimezone(
                    job.next_run?.start_time,
                    systemTimezone,
                  ).format("lll")
                : null}
            </td>
            <td className={S.nowrap}></td>
            <td>
              <TagList tags={tags} tagIds={job.tag_ids ?? []} />
            </td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}
