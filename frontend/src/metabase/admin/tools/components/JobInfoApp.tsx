import cx from "classnames";
import type { ReactNode } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useGetTasksInfoQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Ellipsified, Flex, Stack } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import type { Job } from "metabase-types/api";

interface SchedulerInfoProps {
  scheduler?: string[] | null;
}

const SchedulerInfo = ({ scheduler }: SchedulerInfoProps) => {
  return (
    scheduler && (
      <Flex align="center">
        <pre>{scheduler.join("\n")}</pre>
      </Flex>
    )
  );
};

interface JobsTableProps {
  jobs?: Job[] | null;
}

const JobsTable = ({ jobs }: JobsTableProps) => {
  const dispatch = useDispatch();

  const onClickJob = (job: Job) => {
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

interface JobInfoAppProps {
  children?: ReactNode;
}

export const JobInfoApp = ({ children }: JobInfoAppProps) => {
  const { data, error, isFetching } = useGetTasksInfoQuery(undefined);

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
