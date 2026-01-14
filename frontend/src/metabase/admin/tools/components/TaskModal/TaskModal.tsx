import { useMemo } from "react";
import { t } from "ttag";

import { LogsViewer } from "metabase/admin/tools/components/Logs/LogsViewer";
import { useGetTaskQuery } from "metabase/api";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { CopyButton } from "metabase/common/components/CopyButton";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/common/components/ModalContent";
import { openSaveDialog } from "metabase/lib/dom";
import { Box, Button, Flex, Icon, Tabs } from "metabase/ui";
import type { Task } from "metabase-types/api";

import S from "./TaskModal.module.css";

interface Props {
  params: { taskId: number };
  onClose: VoidFunction;
}

export const TaskModal = ({ params, onClose }: Props) => {
  const { data: task, error, isLoading } = useGetTaskQuery(params.taskId);
  const hasLogs = task?.logs?.length !== 0;
  const code = formatTaskDetails(task);
  const linesCount = useMemo(() => code.split("\n").length, [code]);

  const handleDownload = () => {
    const filename = getFilename(task);
    const blob = new Blob([code], { type: "text/json" });
    openSaveDialog(filename, blob);
  };

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <ModalContent title={t`Task details`} onClose={onClose}>
      <Tabs defaultValue="details">
        <Tabs.List>
          <Tabs.Tab value="details">{t`Details`}</Tabs.Tab>
          {hasLogs && <Tabs.Tab value="logs">{t`Logs`}</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="details">
          <Box
            className={S.codeContainer}
            p={linesCount > 1 ? 0 : "xs"}
            pos="relative"
            mt="md"
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
        </Tabs.Panel>

        {hasLogs && (
          <Tabs.Panel value="logs">
            <Box className={S.codeContainer} mt="md">
              <LogsViewer logs={task?.logs ?? []}></LogsViewer>
            </Box>
          </Tabs.Panel>
        )}
      </Tabs>

      <Flex gap="md" justify="flex-end" mt="xl">
        <Button
          leftSection={<Icon name="download" />}
          variant="filled"
          onClick={handleDownload}
        >{t`Download`}</Button>
      </Flex>
    </ModalContent>
  );
};

function getFilename(task: Task | undefined) {
  return task ? `task-${task.id}.json` : "task.json";
}

function formatTaskDetails(task: Task | undefined): string {
  return task ? JSON.stringify(task.task_details, null, 2) : "";
}
