import cx from "classnames";
import type { Location } from "history";
import type { ReactNode } from "react";
import { withRouter } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { useListDatabasesQuery, useListTasksQuery } from "metabase/api";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import AdminHeader from "metabase/components/AdminHeader";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/components/PaginationControls";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon, Tooltip } from "metabase/ui";
import type { Database, Task } from "metabase-types/api";

import { TaskPicker } from "../../components/TaskPicker";
import { TaskStatusPicker } from "../../components/TaskStatusPicker";

import { urlStateConfig } from "./utils";

type TasksAppProps = {
  children: ReactNode;
  location: Location;
};

const PAGE_SIZE = 50;

const TasksAppBase = ({ children, location }: TasksAppProps) => {
  const [{ page, task, status }, { patchUrlState }] = useUrlState(
    location,
    urlStateConfig,
  );

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
  const total = tasksData?.total ?? 0;
  const databases = databasesData?.data ?? [];
  const isLoading = isLoadingTasks || isLoadingDatabases;
  const error = tasksError || databasesError;
  const showLoadingAndErrorWrapper = isLoading || error != null;

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
          <TaskPicker
            value={task}
            onChange={(task) => patchUrlState({ task, page: 0 })}
          />

          <TaskStatusPicker
            value={status}
            onChange={(status) => patchUrlState({ status, page: 0 })}
          />
        </Flex>

        <PaginationControls
          onPreviousPage={() => patchUrlState({ page: page - 1 })}
          onNextPage={() => patchUrlState({ page: page + 1 })}
          page={page}
          pageSize={50}
          itemsLength={tasks.length}
          total={total}
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
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <Flex c="text-light" justify="center">{t`No results`}</Flex>
                  </td>
                </tr>
              )}

              {tasks.length > 0 &&
                tasks.map((task: Task) => {
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
