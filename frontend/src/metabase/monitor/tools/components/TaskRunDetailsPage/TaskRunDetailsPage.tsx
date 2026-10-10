import cx from "classnames";
import { t } from "ttag";

import {
  useGetTaskRunQuery,
  useSyncDatabaseSchemaMutation,
} from "metabase/api";
import { CopyButton } from "metabase/common/components/CopyButton";
import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { modelIconMap } from "metabase/common/utils/icon";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { MonitorPageContent } from "metabase/monitor/components/MonitorPageContent";
import { useNavigate, useParams } from "metabase/router";
import {
  Anchor,
  Box,
  Button,
  FixedSizeIcon,
  Flex,
  Grid,
  Icon,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { DebugLogLevel, Task } from "metabase-types/api";

import {
  formatTaskDuration,
  formatTaskRunEntityType,
  formatTaskRunType,
  getEntityUrl,
  renderTaskRunCounters,
} from "../../utils";
import { MonitorBackLink } from "../MonitorBackLink";
import { TaskRunStatusBadge } from "../TaskRunStatusBadge";
import { TaskStatusBadge } from "../TaskStatusBadge";

import S from "./TaskRunDetailsPage.module.css";

export const TaskRunDetailsPage = () => {
  const { runId } = useParams();
  const { data: taskRun, error, isLoading } = useGetTaskRunQuery(Number(runId));
  const navigate = useNavigate();
  const [syncDatabaseSchema, { isLoading: isStartingDebugRun }] =
    useSyncDatabaseSchemaMutation();

  const onClickTask = (task: Task) => {
    navigate(Urls.monitorTaskDetails(task.id));
  };

  if (!taskRun || error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  const isDatabaseSync =
    taskRun.entity_type === "database" &&
    (taskRun.run_type === "sync" || taskRun.run_type === "fingerprint");
  const hasDebugLogs = taskRun.tasks.some(
    (task) => task.debug_log_bytes != null,
  );

  const handleRunAgainWithLogs = async (level: DebugLogLevel) => {
    await syncDatabaseSchema({ id: taskRun.entity_id, debug: level }).unwrap();
    navigate(
      Urls.monitorTasksRunsFor({
        runType: "sync",
        entityType: "database",
        entityId: taskRun.entity_id,
      }),
    );
  };

  return (
    <Flex h="100%" wrap="nowrap">
      <MonitorMain gap="xl">
        <MonitorBackLink to={Urls.monitorTasks()} label={t`Back to Tasks`} />

        <MonitorPageContent className={S.content}>
          <Grid>
            <Grid.Col span={{ base: 12, lg: "content" }} maw="50%">
              <Flex justify="space-between" align="flex-start" gap="md" mb="lg">
                <MonitorHeaderTitle>{t`Run details`}</MonitorHeaderTitle>
                {isDatabaseSync && hasDebugLogs && (
                  <Button
                    component="a"
                    href={`/api/task/runs/${taskRun.id}/logs`}
                    download={`run-${taskRun.id}.log`}
                    leftSection={<Icon name="download" />}
                  >{t`Download debug log`}</Button>
                )}
                {isDatabaseSync && !hasDebugLogs && (
                  <Menu position="bottom-end">
                    <Menu.Target>
                      <Button
                        variant="filled"
                        leftSection={<Icon name="refresh" />}
                        rightSection={<Icon name="chevrondown" />}
                        loading={isStartingDebugRun}
                      >{t`Run again with logs`}</Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>
                        {t`Syncs this database again and stores the full log of every step with its task, up to 10 MB.`}
                      </Menu.Label>
                      <Menu.Item
                        onClick={() => handleRunAgainWithLogs("debug")}
                      >
                        {t`Debug level`}
                      </Menu.Item>
                      <Menu.Item
                        onClick={() => handleRunAgainWithLogs("trace")}
                      >
                        {t`Trace level (most verbose)`}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Flex>
              <Stack gap="sm">
                <Flex gap="lg">
                  <Text fw="bold" w={120}>{t`ID`}</Text>
                  <Text>{taskRun.id}</Text>
                </Flex>
                <Flex gap="lg">
                  <Text fw="bold" w={120}>{t`Task`}</Text>
                  <Text>{formatTaskRunType(taskRun.run_type)}</Text>
                </Flex>
                <Flex gap="lg" align="center">
                  <Text fw="bold" w={120}>{t`Entity`}</Text>
                  <Anchor
                    component={Link}
                    to={getEntityUrl(
                      taskRun.entity_type,
                      taskRun.entity_id,
                      taskRun.entity_name ?? undefined,
                    )}
                    display="inline-flex"
                    style={{ alignItems: "center", gap: "0.25rem" }}
                  >
                    <FixedSizeIcon
                      name={modelIconMap[taskRun.entity_type]}
                      aria-label={formatTaskRunEntityType(taskRun.entity_type)}
                    />
                    {taskRun.entity_name ?? taskRun.entity_id}
                  </Anchor>
                </Flex>
                <Flex gap="lg" align="center">
                  <Text fw="bold" w={120}>{t`Status`}</Text>
                  <TaskRunStatusBadge taskRun={taskRun} />
                </Flex>
                <Flex gap="lg">
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
                <Flex gap="lg">
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
                <Flex gap="lg">
                  <Text fw="bold" w={120}>{t`Task count`}</Text>
                  <Text>{renderTaskRunCounters(taskRun)}</Text>
                </Flex>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, lg: "auto" }}>
              <MonitorHeaderTitle mb="lg">{t`Associated tasks`}</MonitorHeaderTitle>
              <table
                className={cx(AdminS.ContentTable)}
                data-testid="task-run-tasks-table"
              >
                <thead>
                  <tr>
                    <Box component="th" w={200}>{t`Step`}</Box>
                    <th>{t`Status`}</th>
                    <th>{t`Duration`}</th>
                  </tr>
                </thead>
                <tbody>
                  {taskRun.tasks.length === 0 && (
                    <tr>
                      <td colSpan={3}>
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
                      <td>
                        {task.duration == null
                          ? EMPTY_CELL_PLACEHOLDER
                          : formatTaskDuration(task.duration)}
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
