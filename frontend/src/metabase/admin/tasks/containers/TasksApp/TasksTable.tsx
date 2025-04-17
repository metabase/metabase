import cx from "classnames";
import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Flex } from "metabase/ui";
import type { Database, Task } from "metabase-types/api";
import type { SortDirection } from "metabase-types/api/sorting";

import { SortableColumnHeader } from "./SortableColumnHeader";
import type { SortColumn } from "./types";

interface Props {
  databases: Database[];
  error: unknown;
  isLoading: boolean;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  tasks: Task[];
  onSort: (column: SortColumn) => void;
}

export const TasksTable = ({
  databases,
  error,
  isLoading,
  sortColumn,
  sortDirection,
  tasks,
  onSort,
}: Props) => {
  // index databases by id for lookup
  const databaseByID: Record<number, Database> = _.indexBy(databases, "id");
  const showLoadingAndErrorWrapper = isLoading || error != null;

  return (
    <table className={cx(AdminS.ContentTable, CS.mt2)}>
      <thead>
        <tr>
          <th>{t`Task`}</th>
          <th>{t`DB Name`}</th>
          <th>{t`DB Engine`}</th>
          <th>
            <SortableColumnHeader
              column="started_at"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
            >{t`Started at`}</SortableColumnHeader>
          </th>
          <th>
            <SortableColumnHeader
              column="ended_at"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
            >{t`Ended at`}</SortableColumnHeader>
          </th>
          <th>
            <SortableColumnHeader
              column="duration"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={onSort}
            >{t`Duration (ms)`}</SortableColumnHeader>
          </th>
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
