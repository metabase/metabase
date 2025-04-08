import { useMemo } from "react";
import { goBack } from "react-router-redux";
import { t } from "ttag";

import { useGetTaskQuery } from "metabase/api";
import { CodeBlock } from "metabase/components/CodeBlock";
import { CopyButton } from "metabase/components/CopyButton";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { openSaveDialog } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Flex, Icon } from "metabase/ui";

import S from "./TaskModal.module.css";

type TaskModalProps = {
  params: { taskId: number };
};

export const TaskModal = ({ params }: TaskModalProps) => {
  const dispatch = useDispatch();
  const { data: task, error, isLoading } = useGetTaskQuery(params.taskId);

  const code = useMemo(() => {
    return task ? JSON.stringify(task.task_details, null, 2) : "";
  }, [task]);
  const linesCount = useMemo(() => code.split("\n").length, [code]);

  const handleClose = () => {
    dispatch(goBack());
  };

  const handleDownload = () => {
    const filename = task ? `task-${task.id}.json` : `task.json`;
    const blob = new Blob([code], { type: "text/json" });
    openSaveDialog(filename, blob);
  };

  if (error || isLoading || !task) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <ModalContent title={t`Task details`} onClose={handleClose}>
      <Box
        className={S.codeContainer}
        p={linesCount > 1 ? 0 : "xs"}
        pos="relative"
      >
        <CodeBlock
          basicSetup={{
            /**
             * Hide line numbers when there's only 1 line to avoid confusion
             * whether the line number is or isn't a part of the log.
             */
            lineNumbers: linesCount > 1,
          }}
          code={code}
          language="json"
        />

        <Box p="sm" pos="absolute" right={0} top={0}>
          <CopyButton value={code} />
        </Box>
      </Box>

      <Flex gap="md" justify="space-between" mt="xl">
        <Button leftSection={<Icon name="audit" />}>{t`See logs`}</Button>

        <Button
          leftSection={<Icon name="download" />}
          variant="filled"
          onClick={handleDownload}
        >{t`Download`}</Button>
      </Flex>
    </ModalContent>
  );
};
