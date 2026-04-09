import cx from "classnames";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useGetTaskRunQuery } from "metabase/api";
import { CopyButton } from "metabase/common/components/CopyButton";
import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  Anchor,
  Box,
  Flex,
  Grid,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import type { Task } from "metabase-types/api";

import {
  formatTaskRunEntityType,
  formatTaskRunType,
  getEntityUrl,
  renderTaskRunCounters,
} from "../../utils";
import { TaskRunStatusBadge } from "../TaskRunStatusBadge";
import { TaskStatusBadge } from "../TaskStatusBadge";

type TaskRunDetailsPageProps = {
  params: { runId: number };
};

export const TaskRunDetailsPage = ({ params }: TaskRunDetailsPageProps) => {
  const { data: taskRun, error, isLoading } = useGetTaskRunQuery(params.runId);
  const dispatch = useDispatch();

  const onClickTask = (task: Task) => {
    dispatch(push(Urls.adminToolsTaskDetails(task.id)));
  };

  if (!taskRun || error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <SettingsSection>
      <Flex align="center" gap="sm">
        <Link to={Urls.adminToolsTasksRuns()}>
          <Flex align="center" gap="xs" c="text-secondary">
            <Icon name="chevronleft" />
            {t`Back to Runs`}
          </Flex>
        </Link>
      </Flex>

      <Grid>
        <Grid.Col span={{ base: 12, lg: "content" }} maw="50%">
          <Title order={3} mb="md">{t`Run details`}</Title>
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
                  taskRun.entity_name,
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
                "—"
              )}
            </Flex>
            <Flex gap="md">
              <Text fw="bold" w={120}>{t`Task count`}</Text>
              <Text>{renderTaskRunCounters(taskRun)}</Text>
            </Flex>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: "auto" }}>
          <Title order={3} mb="md">{t`Associated tasks`}</Title>
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
                      c="text-tertiary"
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
    </SettingsSection>
  );
};
