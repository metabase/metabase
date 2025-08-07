import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { Card, Group, Pill } from "metabase/ui";
import {
  useListTransformJobsQuery,
  useListTransformTagsQuery,
} from "metabase-enterprise/api";
import type {
  TransformJob,
  TransformTag,
  TransformTagId,
} from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { getJobUrl } from "../../../urls";
import { formatStatus, formatTimestamp } from "../../../utils";

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
  const tagById = getTagById(tags);
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
            <td>
              {job.last_execution?.start_time
                ? formatTimestamp(job.last_execution?.start_time)
                : null}
            </td>
            <td>
              {job.last_execution?.status
                ? formatStatus(job.last_execution.status)
                : null}
            </td>
            <td>
              <Group>
                {getJobTags(job.tag_ids ?? [], tagById).map((tag) => (
                  <Pill key={tag.id}>{tag.name}</Pill>
                ))}
              </Group>
            </td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}

function getTagById(
  tags: TransformTag[],
): Record<TransformTagId, TransformTag> {
  return Object.fromEntries(tags.map((tag) => [tag.id, tag]));
}

function getJobTags(
  tagIds: TransformTagId[],
  tagById: Record<TransformTagId, TransformTag>,
) {
  return tagIds.map((tagId) => tagById[tagId]).filter((tag) => tag != null);
}
