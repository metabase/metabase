import cx from "classnames";
import type { Location } from "history";
import { type ReactNode, useState } from "react";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { useListDatabasesQuery, useListTasksQuery } from "metabase/api";
import AdminHeader from "metabase/components/AdminHeader";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/components/PaginationControls";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { Box, Flex, Icon, Tooltip } from "metabase/ui";
import type { Database, Task, TaskStatus } from "metabase-types/api";

import { TaskPicker } from "../components/TaskPicker";
import { TaskStatusPicker } from "../components/TaskStatusPicker";

type TasksAppProps = {
  children: ReactNode;
  location: Location;
};

function getPageFromLocation(location: Location) {
  const pageParam = Array.isArray(location.query.page)
    ? location.query.page[0]
    : location.query.page;
  const page = parseInt(pageParam || "0", 10);
  return Number.isFinite(page) ? page : 0;
}

function getLocationWithPage(location: Location, page: number) {
  return {
    ...location,
    query: {
      page: page === 0 ? undefined : page,
    },
  };
}

const PAGE_SIZE = 50;

const TasksAppBase = ({ children, location }: TasksAppProps) => {
  const dispatch = useDispatch();
  const page = getPageFromLocation(location);
  const [task, setTask] = useState<Task["task"] | null>(null);
  const [status, setStatus] = useState<TaskStatus | null>(null);

  const {
    data: tasksData,
    isFetching: isLoadingTasks,
    error: tasksError,
  } = useListTasksQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    task: task ?? undefined,
    status: status ?? undefined,
  });

  const {
    data: databasesData,
    isFetching: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const tasks = tasksData?.data ?? [];
  const databases = databasesData?.data ?? [];
  const isLoading = isLoadingTasks || isLoadingDatabases;
  const error = tasksError || databasesError;
  const showLoadingAndErrorWrapper = isLoading || error != null;

  const handlePageChange = (page: number) => {
    const newLocation = getLocationWithPage(location, page);
    dispatch(push(newLocation));
  };

  // index databases by id for lookup
  const databaseByID: Record<number, Database> = _.indexBy(databases, "id");

  return (
    <Box pl="md">
      <Flex align="center" gap="sm">
        <AdminHeader title={t`Troubleshooting logs`} />

        <Flex align="center" c="text-medium" flex="0 0 auto">
          <Tooltip
            label={t`Trying to get to the bottom of something? This section shows logs of Metabase's background tasks, which can help shed light on what's going on.`}
          >
            <Icon name="info" />
          </Tooltip>
        </Flex>
      </Flex>

      <Flex gap="md" justify="space-between" mt="md">
        <Flex gap="md">
          <TaskPicker value={task} onChange={setTask} />

          <TaskStatusPicker value={status} onChange={setStatus} />
        </Flex>

        <PaginationControls
          onPreviousPage={() => handlePageChange(page - 1)}
          onNextPage={() => handlePageChange(page + 1)}
          page={page}
          pageSize={50}
          itemsLength={tasks.length}
          total={tasksData?.total ?? 0}
        />
      </Flex>

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
          {showLoadingAndErrorWrapper && (
            <tr>
              <td colSpan={8}>
                <LoadingAndErrorWrapper loading={isLoading} error={error} />
              </td>
            </tr>
          )}

          {!showLoadingAndErrorWrapper && (
            <>
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
                    <td>
                      {match(task.status)
                        .with("failed", () => t`Failed`)
                        .with("started", () => t`Started`)
                        .with("success", () => t`Success`)
                        .with("unknown", () => t`Unknown`)
                        .exhaustive()}
                    </td>
                    <td>
                      <Link
                        className={cx(CS.link, CS.textBold)}
                        to={`/admin/troubleshooting/tasks/${task.id}`}
                      >{t`View`}</Link>
                    </td>
                  </tr>
                );
              })}
            </>
          )}
        </tbody>
      </table>

      {
        // render 'children' so that the invididual task modals show up
        children
      }
    </Box>
  );
};

export const TasksApp = withRouter(TasksAppBase);
