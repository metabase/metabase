import cx from "classnames";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { TaskStatusBadge } from "metabase/admin/tools/components/TaskStatusBadge";
import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { SortableColumnHeader } from "metabase/common/components/ItemsTable/BaseItemsTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Flex } from "metabase/ui";
import type {
  Database,
  ListTasksSortColumn,
  SortingOptions,
  Task,
} from "metabase-types/api";

interface Props {
  databases: Database[];
  error: unknown;
  isLoading: boolean;
  sortingOptions: SortingOptions<ListTasksSortColumn>;
  tasks: Task[];
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<ListTasksSortColumn>,
  ) => void;
}

export const TasksTable = ({
  databases,
  error,
  isLoading,
  sortingOptions,
  tasks,
  onSortingOptionsChange,
}: Props) => {
  // index databases by id for lookup
  const databaseByID: Record<number, Database> = _.indexBy(databases, "id");
  const showLoadingAndErrorWrapper = isLoading || error != null;
  const dispatch = useDispatch();

  const onClickTask = (task: Task) => {
    dispatch(push(Urls.adminToolsTaskDetails(task.id)));
  };

  return (
    <table
      className={cx(AdminS.ContentTable, CS.mt2)}
      data-testid="tasks-table"
    >
      <thead>
        <tr>
          {/* set width to limit CLS when changing sort direction */}
          <Box component="th" w={300}>{t`Task`}</Box>
          <th>{t`DB Name`}</th>
          <th>{t`DB Engine`}</th>
          <SortableColumnHeader
            name="started_at"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
          >{t`Started at`}</SortableColumnHeader>
          <SortableColumnHeader
            name="ended_at"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
          >{t`Ended at`}</SortableColumnHeader>
          <SortableColumnHeader
            name="duration"
            sortingOptions={sortingOptions}
            onSortingOptionsChange={onSortingOptionsChange}
          >{t`Duration (ms)`}</SortableColumnHeader>
          <th>{t`Status`}</th>
        </tr>
      </thead>

      <tbody>
        {showLoadingAndErrorWrapper && (
          <tr>
            <td colSpan={7}>
              <LoadingAndErrorWrapper loading={isLoading} error={error} />
            </td>
          </tr>
        )}

        {!showLoadingAndErrorWrapper && (
          <>
            {tasks.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <Flex
                    c="text-tertiary"
                    justify="center"
                  >{t`No results`}</Flex>
                </td>
              </tr>
            )}

            {tasks.map((task: Task) => {
              const db = task.db_id ? databaseByID[task.db_id] : null;
              const name = db ? db.name : null;
              const engine = db ? db.engine : null;
              // only want unknown if there is a db on the task and we don't have info
              return (
                <tr
                  data-testid="task"
                  key={task.id}
                  className={CS.cursorPointer}
                  onClick={() => onClickTask(task)}
                >
                  <td className={CS.textBold}>{task.task}</td>
                  <td>{task.db_id ? name || t`Unknown name` : null}</td>
                  <td>{task.db_id ? engine || t`Unknown engine` : null}</td>

                  <td>
                    <Ellipsified
                      style={{ maxWidth: 180 }}
                      alwaysShowTooltip
                      tooltip={task.started_at}
                    >
                      <DateTime
                        value={task.started_at}
                        unit="minute"
                        data-testid="started-at"
                      />
                    </Ellipsified>
                  </td>
                  <td>
                    {task.ended_at ? (
                      <Ellipsified
                        style={{ maxWidth: 180 }}
                        alwaysShowTooltip={Boolean(task.ended_at)}
                        tooltip={task.ended_at}
                      >
                        <DateTime
                          value={task.ended_at}
                          unit="minute"
                          data-testid="ended-at"
                        />
                      </Ellipsified>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{task.duration}</td>
                  <td>
                    <TaskStatusBadge task={task} />
                  </td>
                </tr>
              );
            })}
          </>
        )}
      </tbody>
    </table>
  );
};
