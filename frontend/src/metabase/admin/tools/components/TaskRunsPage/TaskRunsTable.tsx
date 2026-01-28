import cx from "classnames";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Box, Flex } from "metabase/ui";
import type { TaskRun } from "metabase-types/api";

import { formatTaskRunType, renderTaskRunCounters } from "../../utils";
import { TaskRunStatusBadge } from "../TaskRunStatusBadge";

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
    dispatch(push(Urls.adminToolsTaskRunDetails(taskRun.id)));
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
          <th>{t`Task Count`}</th>
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
                  {formatTaskRunType(taskRun.run_type)}
                </td>
                <td>
                  <Ellipsified style={{ maxWidth: 200 }}>
                    {taskRun.entity_name}
                  </Ellipsified>
                </td>
                <td>
                  <Ellipsified
                    style={{ maxWidth: 180 }}
                    alwaysShowTooltip
                    tooltip={taskRun.started_at}
                  >
                    <DateTime
                      value={taskRun.started_at}
                      unit="minute"
                      data-testid="started-at"
                    />
                  </Ellipsified>
                </td>
                <td>
                  {taskRun.ended_at ? (
                    <Ellipsified
                      style={{ maxWidth: 180 }}
                      tooltip={taskRun.ended_at}
                    >
                      <DateTime
                        value={taskRun.ended_at}
                        unit="minute"
                        data-testid="ended-at"
                      />
                    </Ellipsified>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <TaskRunStatusBadge taskRun={taskRun} />
                </td>
                <td>{renderTaskRunCounters(taskRun)}</td>
              </tr>
            ))}
          </>
        )}
      </tbody>
    </table>
  );
};
