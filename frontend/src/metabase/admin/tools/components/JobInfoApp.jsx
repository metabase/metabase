/* eslint-disable react/prop-types */
import cx from "classnames";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useGetTasksInfoQuery } from "metabase/api";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { Flex, Stack } from "metabase/ui";

const SchedulerInfo = ({ scheduler }) => {
  return (
    scheduler && (
      <Flex align="center">
        <pre>{scheduler.join("\n")}</pre>
      </Flex>
    )
  );
};

const JobsTable = ({ jobs }) => {
  const dispatch = useDispatch();

  const onClickJob = (job) => {
    dispatch(push(`/admin/tools/jobs/${job.key}`));
  };

  return (
    jobs && (
      <table className={cx(AdminS.ContentTable, CS.mt2)}>
        <thead>
          <tr>
            <th>{t`Key`}</th>
            <th>{t`Class`}</th>
            <th>{t`Description`}</th>
          </tr>
        </thead>
        <tbody>
          {jobs &&
            jobs.map((job) => (
              <tr
                key={job.key}
                className={CS.cursorPointer}
                onClick={() => onClickJob(job)}
              >
                <td className={CS.textBold} style={{ maxWidth: 250 }}>
                  <Ellipsified>{job.key}</Ellipsified>
                </td>
                <td style={{ maxWidth: 250 }}>
                  <Ellipsified>{job.class}</Ellipsified>
                </td>
                <td style={{ maxWidth: 250 }}>
                  <Ellipsified>{job.description}</Ellipsified>
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
    <SettingsPageWrapper title={t`Scheduler Info`}>
      <LoadingAndErrorWrapper loading={isFetching} error={error}>
        <Stack gap="xl">
          <SettingsSection>
            <SchedulerInfo scheduler={data?.scheduler} />
          </SettingsSection>
          <SettingsSection>
            <JobsTable jobs={data?.jobs} />
          </SettingsSection>
          {
            // render 'children' so that the individual task modals show up
            children
          }
        </Stack>
      </LoadingAndErrorWrapper>
    </SettingsPageWrapper>
  );
};
