import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { parseTimestamp } from "metabase/lib/time-dayjs";
import { Card } from "metabase/ui";
import {
  useListTransformJobsQuery,
  useListTransformTagsQuery,
} from "metabase-enterprise/api";
import type { TransformJob } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { RunStatusInfo } from "../../../components/RunStatusInfo";
import { TagList } from "../../../components/TagList";
import { getJobUrl } from "../../../urls";

import S from "./JobList.module.css";

export function JobList() {
  const {
    data: jobs = [],
    isLoading: isLoadingJobs,
    error: jobsError,
  } = useListTransformJobsQuery();
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
        columnTitles={[t`Job`, t`Last run at`, t`Last run status`, t`Tags`]}
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
                ? parseTimestamp(job.last_run?.start_time).format("lll")
                : null}
            </td>
            <td className={S.nowrap}>
              {job.last_run != null ? (
                <RunStatusInfo
                  status={job.last_run.status}
                  message={job.last_run.message}
                  endTime={
                    job.last_run.end_time != null
                      ? parseTimestamp(job.last_run.end_time).toDate()
                      : null
                  }
                />
              ) : null}
            </td>
            <td>
              <TagList tags={tags} tagIds={job.tag_ids ?? []} />
            </td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}
