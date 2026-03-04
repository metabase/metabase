import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { useGetTaskQuery, useListDatabasesQuery } from "metabase/api";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { CopyButton } from "metabase/common/components/CopyButton";
import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { openSaveDialog } from "metabase/lib/dom";
import * as Urls from "metabase/lib/urls";
import {
  Anchor,
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import type { Database } from "metabase-types/api";

import { SettingsSection } from "../../../components/SettingsSection";
import { formatTaskDetails, getFilename } from "../../utils";
import { LogsViewer } from "../Logs/LogsViewer";
import { TaskStatusBadge } from "../TaskStatusBadge";

import S from "./TaskDetailsPage.module.css";

type TaskDetailsPageProps = {
  params: { taskId: number };
};

export const TaskDetailsPage = ({ params }: TaskDetailsPageProps) => {
  const { data: task, error, isLoading } = useGetTaskQuery(params.taskId);
  const code = formatTaskDetails(task);
  const linesCount = useMemo(() => code.split("\n").length, [code]);
  const { data: databasesData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();

  if (!task || error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }
  const hasLogs = Boolean(task.logs?.length);
  const databases = databasesData?.data ?? [];
  const databaseByID: Record<number, Database> = _.indexBy(databases, "id");
  const db = task.db_id ? databaseByID[task.db_id] : null;
  const dbName = db?.name ?? t`Unknown name`;
  const dbEngine = db?.engine ?? t`Unknown engine`;

  const handleDownload = () => {
    const filename = getFilename(task);
    const blob = new Blob([code], { type: "text/json" });
    openSaveDialog(filename, blob);
  };

  return (
    <SettingsSection>
      <Flex align="center" gap="sm">
        <Link to={Urls.adminToolsTasksList()}>
          <Flex align="center" gap="xs" c="text-secondary">
            <Icon name="chevronleft" />
            {t`Back to Tasks`}
          </Flex>
        </Link>
      </Flex>

      <Stack gap="sm">
        <Title order={3}>{t`Task details`}</Title>
        <Flex gap="md">
          <Text fw="bold" w={120}>{t`ID`}</Text>
          <Text>{task.id}</Text>
        </Flex>
        <Flex gap="md">
          <Text fw="bold" w={120}>{t`Task`}</Text>
          <Text>{task.task}</Text>
        </Flex>
        <Flex gap="md" align="center">
          <Text fw="bold" w={120}>{t`Status`}</Text>
          <TaskStatusBadge task={task} />
        </Flex>
        {task.run_id !== null && (
          <Flex gap="md" align="baseline">
            <Text fw="bold" w={120}>{t`Task run`}</Text>
            <Anchor
              component={Link}
              to={Urls.adminToolsTaskRunDetails(task.run_id)}
            >
              {t`Go to the corresponding run`}
            </Anchor>
          </Flex>
        )}
        <Flex gap="md">
          <Text fw="bold" w={120}>{t`DB Name`}</Text>
          <Text>
            {isLoadingDatabases ? <Loader size="xs" /> : db ? dbName : "—"}
          </Text>
        </Flex>
        <Flex gap="md">
          <Text fw="bold" w={120}>{t`DB Engine`}</Text>
          <Text>
            {isLoadingDatabases ? <Loader size="xs" /> : db ? dbEngine : "—"}
          </Text>
        </Flex>
        <Flex gap="md" align="baseline">
          <Text fw="bold" w={120}>{t`Started at`}</Text>
          <Tooltip label={task.started_at}>
            <DateTime
              value={task.started_at}
              unit="minute"
              data-testid="started-at"
            />
          </Tooltip>
          <CopyButton value={task.started_at} />
        </Flex>
        <Flex gap="md">
          <Text fw="bold" w={120}>{t`Ended at`}</Text>
          {task.ended_at ? (
            <Tooltip label={task.ended_at}>
              <DateTime
                value={task.ended_at}
                unit="minute"
                data-testid="ended-at"
              />
            </Tooltip>
          ) : (
            "—"
          )}
          {task.ended_at && <CopyButton value={task.ended_at} />}
        </Flex>
        <Flex gap="md">
          <Text fw="bold" w={120}>{t`Duration (ms)`}</Text>
          <Text>{task.duration}</Text>
        </Flex>
        <Flex justify="space-between" align="flex-end">
          <Title order={3}>{t`JSON details`}</Title>
          <Button
            leftSection={<Icon name="download" />}
            variant="filled"
            onClick={handleDownload}
          >{t`Download`}</Button>
        </Flex>
        <Box
          className={S.codeContainer}
          p={linesCount > 1 ? 0 : "xs"}
          pos="relative"
          mt="md"
          data-testid="code-container"
        >
          <CodeEditor
            language="json"
            lineNumbers={linesCount > 1}
            readOnly
            value={code}
          />

          <Box p="sm" pos="absolute" right={0} top={0}>
            <CopyButton value={code} />
          </Box>
        </Box>

        <Title order={3}>{t`Logs`}</Title>
        {hasLogs ? (
          <Box className={S.codeContainer}>
            <LogsViewer
              logs={task?.logs ?? []}
              data-testid="task-logs"
            ></LogsViewer>
          </Box>
        ) : (
          <Text>{t`There are no captured logs`}</Text>
        )}
      </Stack>
    </SettingsSection>
  );
};
