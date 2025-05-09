import { useMemo } from "react";
import { Link } from "react-router";
import { goBack } from "react-router-redux";
import { t } from "ttag";

import { useGetTaskQuery } from "metabase/api";
import { CodeEditor } from "metabase/components/CodeEditor";
import { CopyButton } from "metabase/components/CopyButton";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { openSaveDialog } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Flex, Icon } from "metabase/ui";
import type { Task } from "metabase-types/api";

import S from "./TaskModal.module.css";

interface Props {
  params: { taskId: number };
}

export const TaskModal = ({ params }: Props) => {
  const dispatch = useDispatch();
  const { data: task, error, isLoading } = useGetTaskQuery(params.taskId);
  const code = formatTaskDetails(task);
  const linesCount = useMemo(() => code.split("\n").length, [code]);

  const handleClose = () => {
    dispatch(goBack());
  };

  const handleDownload = () => {
    const filename = getFilename(task);
    const blob = new Blob([code], { type: "text/json" });
    openSaveDialog(filename, blob);
  };

  if (error || isLoading) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <ModalContent title={t`Task details`} onClose={handleClose}>
      <Box
        className={S.codeContainer}
        p={linesCount > 1 ? 0 : "xs"}
        pos="relative"
      >
        <CodeEditor
          language="json"
          /**
           * Hide line numbers when there's only one line:
           * - Not useful in this case
           * - Prevents confusion about whether it's part of the log output
           */
          lineNumbers={linesCount > 1}
          readOnly
          value={code}
        />

        <Box p="sm" pos="absolute" right={0} top={0}>
          <CopyButton value={code} />
        </Box>
      </Box>

      <Flex gap="md" justify="space-between" mt="xl">
        <Button
          component={Link}
          leftSection={<Icon name="audit" />}
          to="/admin/troubleshooting/logs"
        >{t`See logs`}</Button>

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
