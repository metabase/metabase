import cx from "classnames";
import { push } from "react-router-redux";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { Box, Flex } from "metabase/ui";
import type { TaskRun } from "metabase-types/api";

type TaskRunsTableProps = {
  error: unknown;
  isLoading: boolean;
  taskRuns: TaskRun[];
};

export const TaskRunsTable = ({
  error,
  isLoading,
  taskRuns,
}: TaskRunsTableProps) => {
  const showLoadingAndErrorWrapper = isLoading || error != null;
  const dispatch = useDispatch();

  const onClickTaskRun = (taskRun: TaskRun) => {
    dispatch(push(`/admin/tools/tasks/runs/${taskRun.id}`));
  };

  return (
    <table
      className={cx(AdminS.ContentTable, CS.mt2)}
      data-testid="task-runs-table"
    >
      <thead>
        <tr>
          <Box component="th" w={200}>{t`Run Type`}</Box>
          <Box component="th" w={200}>{t`Entity`}</Box>
          <th>{t`Started at`}</th>
          <th>{t`Ended at`}</th>
          <th>{t`Status`}</th>
          <th>{t`Count`}</th>
        </tr>
      </thead>

      <tbody>
        {showLoadingAndErrorWrapper && (
          <tr>
            <td colSpan={6}>
              <LoadingAndErrorWrapper loading={isLoading} error={error} />
            </td>
          </tr>
        )}

        {!showLoadingAndErrorWrapper && (
          <>
            {taskRuns.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <Flex
                    c="text-tertiary"
                    justify="center"
                  >{t`No results`}</Flex>
                </td>
              </tr>
            )}

            {taskRuns.map((taskRun) => (
              <tr
                data-testid="task-run"
                key={taskRun.id}
                className={CS.cursorPointer}
                onClick={() => onClickTaskRun(taskRun)}
              >
                <td className={CS.textBold}>
                  {match(taskRun.run_type)
                    .with("subscription", () => t`Subscription`)
                    .with("alert", () => t`Alert`)
                    .with("sync", () => t`Sync`)
                    .with("fingerprint", () => t`Fingerprint`)
                    .exhaustive()}
                </td>
                <td>
                  <Ellipsified style={{ maxWidth: 200 }}>
                    {taskRun.entity_name}
                  </Ellipsified>
                </td>
                <td>
                  <Ellipsified style={{ maxWidth: 150 }}>
                    {taskRun.started_at}
                  </Ellipsified>
                </td>
                <td>
                  <Ellipsified style={{ maxWidth: 150 }}>
                    {taskRun.ended_at}
                  </Ellipsified>
                </td>
                <td>
                  {match(taskRun.status)
                    .with("started", () => t`Started`)
                    .with("success", () => t`Success`)
                    .with("failed", () => t`Failed`)
                    .exhaustive()}
                </td>
                <td>
                  <span>{taskRun.task_count} </span>
                  <span>
                    ({t`Success`}:{taskRun.success_count} / {t`Failed`}:
                    {taskRun.failed_count})
                  </span>
                </td>
              </tr>
            ))}
          </>
        )}
      </tbody>
    </table>
  );
};
