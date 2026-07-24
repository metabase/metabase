import cx from "classnames";
import { t } from "ttag";

import { useGetTaskRunQuery } from "metabase/api";
import { CopyButton } from "metabase/common/components/CopyButton";
import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { MonitorPageContent } from "metabase/monitor/components/MonitorPageContent";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import { Anchor, Box, Flex, Grid, Stack, Text, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { Task } from "metabase-types/api";

import {
  formatTaskRunEntityType,
  formatTaskRunType,
  getEntityUrl,
  renderTaskRunCounters,
} from "../../utils";
import { MonitorBackLink } from "../MonitorBackLink";
import { TaskRunStatusBadge } from "../TaskRunStatusBadge";
import { TaskStatusBadge } from "../TaskStatusBadge";

import S from "./TaskRunDetailsPage.module.css";

type TaskRunDetailsPageProps = {
  params: { runId: number };
};

export const TaskRunDetailsPage = ({ params }: TaskRunDetailsPageProps) => {
  const { data: taskRun, error, isLoading } = useGetTaskRunQuery(params.runId);
  const dispatch = useDispatch();

  const onClickTask = (task: Task) => {
    dispatch(push(Urls.monitorTaskDetails(task.id)));
  };

  if (!taskRun || error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <Flex h="100%" wrap="nowrap">
      <MonitorMain gap="lg">
        <MonitorBackLink to={Urls.monitorTasksRuns()} label={t`Back to Runs`} />

        <MonitorPageContent className={S.content}>
          <Grid>
            <Grid.Col span={{ base: 12, lg: "content" }} maw="50%">
              <MonitorHeaderTitle mb="md">{t`Run details`}</MonitorHeaderTitle>
              <Stack gap="sm">
                <Flex gap="md">
                  <Text fw="bold" w={120}>{t`ID`}</Text>
                  <Text>{taskRun.id}</Text>
                </Flex>
                <Flex gap="md">
                  <Text fw="bold" w={120}>{t`Run type`}</Text>
                  <Text>{formatTaskRunType(taskRun.run_type)}</Text>
                </Flex>
                <Flex gap="md">
                  <Text fw="bold" w={120}>{t`Entity type`}</Text>
                  <Text>{formatTaskRunEntityType(taskRun.entity_type)}</Text>
                </Flex>
                <Flex gap="md" align="baseline">
                  <Text fw="bold" w={120}>{t`Entity`}</Text>
                  <Anchor
                    component={Link}
                    to={getEntityUrl(
                      taskRun.entity_type,
                      taskRun.entity_id,
                      taskRun.entity_name ?? undefined,
                    )}
                  >
                    {taskRun.entity_name ?? taskRun.entity_id}
                  </Anchor>
                </Flex>
                <Flex gap="md" align="center">
                  <Text fw="bold" w={120}>{t`Status`}</Text>
                  <TaskRunStatusBadge taskRun={taskRun} />
                </Flex>
                <Flex gap="md">
                  <Text fw="bold" w={120}>{t`Started at`}</Text>
                  <Tooltip label={taskRun.started_at}>
                    <DateTime
                      value={taskRun.started_at}
                      unit="minute"
                      data-testid="started-at"
                    />
                  </Tooltip>
                  <CopyButton value={taskRun.started_at} />
                </Flex>
                <Flex gap="md">
                  <Text fw="bold" w={120}>{t`Ended at`}</Text>
                  {taskRun.ended_at ? (
                    <>
                      <Tooltip label={taskRun.ended_at}>
                        <DateTime
                          value={taskRun.ended_at}
                          unit="minute"
                          data-testid="ended-at"
                        />
                      </Tooltip>
                      <CopyButton value={taskRun.ended_at} />
                    </>
                  ) : (
                    EMPTY_CELL_PLACEHOLDER
                  )}
                </Flex>
                <Flex gap="md">
                  <Text fw="bold" w={120}>{t`Task count`}</Text>
                  <Text>{renderTaskRunCounters(taskRun)}</Text>
                </Flex>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, lg: "auto" }}>
              <MonitorHeaderTitle mb="md">{t`Associated tasks`}</MonitorHeaderTitle>
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
                        <Flex
                          c="text-disabled"
                          justify="center"
                        >{t`No tasks`}</Flex>
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
                        <TaskStatusBadge task={task} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Grid.Col>
          </Grid>
        </MonitorPageContent>
      </MonitorMain>
    </Flex>
  );
};
