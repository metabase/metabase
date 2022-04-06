import React from "react";
import { t } from "ttag";
import jobs from "./data";

function ModelCacheRefreshJobs() {
  return (
    <table className="ContentTable border-bottom">
      <thead>
        <tr>
          <th></th>
          <th>{t`Model`}</th>
          <th>{t`Status`}</th>
          <th>{t`Last run at`}</th>
          <th>{t`Last run trigger`}</th>
          <th>{t`Created by`}</th>
          <th>{t`Updated by`}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {jobs.map(job => (
          <tr key={job.id}>
            <th>...</th>
            <th>{job.model.name}</th>
            <th>{job.status}</th>
            <th>{job.last_run_at}</th>
            <th>{job.last_run_trigger}</th>
            <th>{job.creator.common_name}</th>
            <th>{job.updated_by.common_name}</th>
            <th>
              <span>...</span>
            </th>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default ModelCacheRefreshJobs;
