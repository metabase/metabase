/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import { useGetTasksInfoQuery } from "metabase/api";
import AdminHeader from "metabase/components/AdminHeader";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Box, Flex } from "metabase/ui";

const renderSchedulerInfo = scheduler => {
  return (
    scheduler && (
      <Flex align="center">
        <pre>{scheduler.join("\n")}</pre>
      </Flex>
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
    <LoadingAndErrorWrapper loading={isFetching} error={error}>
      <Box pl="md">
        <Flex align="center">
          <AdminHeader title={t`Scheduler Info`} />
        </Flex>
        {renderSchedulerInfo(data?.scheduler)}
        {renderJobsTable(data?.jobs)}
        {
          // render 'children' so that the invididual task modals show up
          children
        }
      </Box>
    </LoadingAndErrorWrapper>
  );
};
