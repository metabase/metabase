/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import { useGetTasksInfoQuery } from "metabase/api";
import AdminHeader from "metabase/components/AdminHeader";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";

import {
  JobInfoHeader,
  JobInfoRoot,
  JobSchedulerInfo,
} from "./JobInfoApp.styled";

const renderSchedulerInfo = scheduler => {
  return (
    scheduler && (
      <JobSchedulerInfo>
        <pre>{scheduler.join("\n")}</pre>
      </JobSchedulerInfo>
    )
  );
};

const renderJobsTable = jobs => {
  return (
    jobs && (
      <table className={cx(AdminS.ContentTable, CS.mt2)}>
        <thead>
          <tr>
            <th>{t`Key`}</th>
            <th>{t`Class`}</th>
            <th>{t`Description`}</th>
            <th>{t`Triggers`}</th>
          </tr>
        </thead>
        <tbody>
          {jobs &&
            jobs.map(job => (
              <tr key={job.key}>
                <td className={CS.textBold}>{job.key}</td>
                <td>{job.class}</td>
                <td>{job.description}</td>
                <td>{job.durable}</td>
                <td>
                  <Link
                    className={CS.link}
                    to={`/admin/troubleshooting/jobs/${job.key}`}
                  >
                    {t`View triggers`}
                  </Link>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    )
  );
};

export const JobInfoApp = ({ children }) => {
  const { data, error, isFetching } = useGetTasksInfoQuery();

  return (
    <LoadingAndErrorWrapper
      loading={isFetching && !data?.scheduler}
      error={error}
    >
      <JobInfoRoot>
        <JobInfoHeader>
          <AdminHeader title={t`Scheduler Info`} />
        </JobInfoHeader>
        {renderSchedulerInfo(data?.scheduler)}
        {renderJobsTable(data?.jobs)}
        {
          // render 'children' so that the invididual task modals show up
          children
        }
      </JobInfoRoot>
    </LoadingAndErrorWrapper>
  );
};
