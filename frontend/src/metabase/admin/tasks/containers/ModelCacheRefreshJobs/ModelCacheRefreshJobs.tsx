import React, { useCallback } from "react";
import { t } from "ttag";
import moment from "moment";

import CheckBox from "metabase/core/components/CheckBox";
import DateTime from "metabase/components/DateTime";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { capitalize } from "metabase/lib/formatting";
import * as Urls from "metabase/lib/urls";

import { ModelCacheRefreshJob } from "./types";
import jobs from "./data";
import {
  ErrorBox,
  IconButtonContainer,
  StyledLink,
} from "./ModelCacheRefreshJobs.styled";

function JobTableItem({ job }: { job: ModelCacheRefreshJob }) {
  const modelUrl = Urls.dataset(job.model);
  const collectionUrl = Urls.collection(job.model.collection);

  const lastRunAtLabel = capitalize(moment(job.last_run_at).fromNow());
  const lastRunTriggerLabel =
    job.last_run_trigger === "api" ? "API" : t`Scheduled`;

  const renderStatus = useCallback(() => {
    if (job.status === "completed") {
      return t`Completed`;
    }
    if (job.status === "error") {
      return <ErrorBox>{job.error}</ErrorBox>;
    }
    return job.status;
  }, [job]);

  return (
    <tr key={job.id}>
      <th>
        <CheckBox />
      </th>
      <th>
        <span>
          <StyledLink to={modelUrl}>{job.model.name}</StyledLink> {t`in`}{" "}
          <StyledLink to={collectionUrl}>
            {job.model.collection.name}
          </StyledLink>
        </span>
      </th>
      <th>{renderStatus()}</th>
      <th>
        <Tooltip tooltip={<DateTime value={job.last_run_at} />}>
          {lastRunAtLabel}
        </Tooltip>
      </th>
      <th>{lastRunTriggerLabel}</th>
      <th>{job.creator.common_name}</th>
      <th>{job.updated_by.common_name}</th>
      <th>
        <Tooltip tooltip={t`Refresh`}>
          <IconButtonContainer>
            <Icon name="refresh" />
          </IconButtonContainer>
        </Tooltip>
      </th>
    </tr>
  );
}

function ModelCacheRefreshJobs() {
  return (
    <table className="ContentTable border-bottom">
      <colgroup>
        <col style={{ width: "1%" }} />
        <col />
        <col style={{ width: "40%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "1%" }} />
      </colgroup>
      <thead>
        <tr>
          <th>
            <CheckBox />
          </th>
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
          <JobTableItem key={job.id} job={job} />
        ))}
      </tbody>
    </table>
  );
}

export default ModelCacheRefreshJobs;
