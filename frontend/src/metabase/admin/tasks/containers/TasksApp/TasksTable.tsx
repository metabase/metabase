import cx from "classnames";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { SortableColumnHeader } from "metabase/components/ItemsTable/BaseItemsTable";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Box, Flex } from "metabase/ui";
import type { Database, ListTasksSortColumn, Task } from "metabase-types/api";
import type { SortingOptions } from "metabase-types/api/sorting";

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

  return (
    <table className={cx(AdminS.ContentTable, CS.mt2)}>
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

            {tasks.map((task: Task) => {
              const db = task.db_id ? databaseByID[task.db_id] : null;
              const name = db ? db.name : null;
              const engine = db ? db.engine : null;
              // only want unknown if there is a db on the task and we don't have info
              return (
                <tr data-testid="task" key={task.id}>
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
  );
};
