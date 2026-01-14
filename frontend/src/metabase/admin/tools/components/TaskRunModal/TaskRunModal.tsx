import cx from "classnames";
import { push } from "react-router-redux";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useGetTaskRunQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/common/components/ModalContent";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import { Box, Flex } from "metabase/ui";
import type { Task } from "metabase-types/api";

type TaskRunModalProps = {
  params: { runId: number };
  onClose: VoidFunction;
};

export const TaskRunModal = ({ params, onClose }: TaskRunModalProps) => {
  const { data: taskRun, error, isLoading } = useGetTaskRunQuery(params.runId);
  const dispatch = useDispatch();

  const onClickTask = (task: Task) => {
    dispatch(push(`/admin/tools/tasks/list/${task.id}`));
  };

  if (!taskRun || error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <ModalContent title={t`Associated tasks`} onClose={onClose}>
      <table
        className={cx(AdminS.ContentTable)}
        data-testid="task-run-tasks-table"
      >
        <thead>
          <tr>
            <Box component="th" w={200}>{t`Task`}</Box>
            <th>{t`Status`}</th>
          </tr>
        </thead>
        <tbody>
          {taskRun.tasks.length === 0 && (
            <tr>
              <td colSpan={2}>
                <Flex c="text-tertiary" justify="center">{t`No tasks`}</Flex>
              </td>
            </tr>
          )}
          {taskRun.tasks.map((task) => (
            <tr
              key={task.id}
              className={CS.cursorPointer}
              data-testid="task-run-task"
              onClick={() => onClickTask(task)}
            >
              <td className={CS.textBold}>{task.task}</td>
              <td>
                {match(task.status)
                  .with("failed", () => t`Failed`)
                  .with("started", () => t`Started`)
                  .with("success", () => t`Success`)
                  .with("unknown", () => t`Unknown`)
                  .exhaustive()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ModalContent>
  );
};
