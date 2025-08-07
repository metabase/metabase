import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { Card } from "metabase/ui";
import { useListTransformJobsQuery } from "metabase-enterprise/api";
import type { TransformJob } from "metabase-types/api";

import { ListEmptyState } from "../../../components/ListEmptyState";
import { getJobUrl } from "../../../urls";
import { formatStatus, formatTimestamp } from "../../../utils";

import S from "./JobList.module.css";

export function JobList() {
  const { data: jobs = [], isLoading, error } = useListTransformJobsQuery();
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
        columnTitles={[t`Job`, t`Last run at`, `Last run status`]}
      >
        {jobs.map((job) => (
          <tr
            key={job.id}
            className={S.row}
            onClick={() => handleRowClick(job)}
          >
            <td>{job.name}</td>
            <td>
              {job.last_execution?.status
                ? formatStatus(job.last_execution.status)
                : null}
            </td>
            <td>
              {job.last_execution?.end_time
                ? formatTimestamp(job.last_execution?.end_time)
                : null}
            </td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}
