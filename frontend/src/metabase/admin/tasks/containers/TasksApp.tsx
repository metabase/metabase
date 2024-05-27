import cx from "classnames";
import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListTasksQuery, useListDatabasesQuery } from "metabase/api";
import AdminHeader from "metabase/components/AdminHeader";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import PaginationControls from "metabase/components/PaginationControls";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Tooltip } from "metabase/ui";
import type { Database, Task } from "metabase-types/api";

import {
  InfoIcon,
  SectionControls,
  SectionHeader,
  SectionRoot,
  SectionTitle,
} from "./TasksApp.styled";

type TasksAppProps = {
  children: ReactNode;
};

export const TasksApp = ({ children }: TasksAppProps) => {
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const {
    data: tasksData,
    isFetching: isLoadingTasks,
    error: tasksError,
  } = useListTasksQuery({
    limit: pageSize,
    offset: page * pageSize,
  });

  const {
    data: databasesData,
    isFetching: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const tasks = tasksData?.data;
  const databases = databasesData?.data;

  if (isLoadingTasks || isLoadingDatabases || tasksError || databasesError) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoadingTasks || isLoadingDatabases}
        error={tasksError || databasesError}
      />
    );
  }

  if (!tasks || !databases) {
    return null;
  }

  // index databases by id for lookup
  const databaseByID: Record<number, Database> = _.indexBy(databases, "id");

  return (
    <SectionRoot>
      <SectionHeader>
        <SectionTitle>
          <AdminHeader title={t`Troubleshooting logs`} />
          <Tooltip
            label={t`Trying to get to the bottom of something? This section shows logs of Metabase's background tasks, which can help shed light on what's going on.`}
          >
            <InfoIcon name="info" />
          </Tooltip>
        </SectionTitle>
        <SectionControls>
          <PaginationControls
            onPreviousPage={() => setPage(page - 1)}
            onNextPage={() => setPage(page + 1)}
            page={page}
            pageSize={50}
            itemsLength={tasks.length}
            total={tasksData.total}
          />
        </SectionControls>
      </SectionHeader>

      <table className={cx(AdminS.ContentTable, CS.mt2)}>
        <thead>
          <tr>
            <th>{t`Task`}</th>
            <th>{t`DB Name`}</th>
            <th>{t`DB Engine`}</th>
            <th>{t`Started at`}</th>
            <th>{t`Ended at`}</th>
            <th>{t`Duration (ms)`}</th>
            <th>{t`Status`}</th>
            <th>{t`Details`}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task: Task) => {
            const db = task.db_id ? databaseByID[task.db_id] : null;
            const name = db ? db.name : null;
            const engine = db ? db.engine : null;
            // only want unknown if there is a db on the task and we don't have info
            return (
              <tr key={task.id}>
                <td className={CS.textBold}>{task.task}</td>
                <td>{task.db_id ? name || t`Unknown name` : null}</td>
                <td>{task.db_id ? engine || t`Unknown engine` : null}</td>
                <td>{task.started_at}</td>
                <td>{task.ended_at}</td>
                <td>{task.duration}</td>
                <td>{task.status}</td>
                <td>
                  <Link
                    className={cx(CS.link, CS.textBold)}
                    to={`/admin/troubleshooting/tasks/${task.id}`}
                  >{t`View`}</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {
        // render 'children' so that the invididual task modals show up
        children
      }
    </SectionRoot>
  );
};
