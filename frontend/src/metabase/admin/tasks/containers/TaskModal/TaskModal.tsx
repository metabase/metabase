import { useMemo } from "react";
import { goBack } from "react-router-redux";
import { t } from "ttag";

import { useGetTaskQuery } from "metabase/api";
import { CodeBlock } from "metabase/components/CodeBlock";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { openSaveDialog } from "metabase/lib/dom";
import { useDispatch } from "metabase/lib/redux";
import { Button, Flex, Icon } from "metabase/ui";

import { CopyButton } from "./CopyButton";

type TaskModalProps = {
  params: { taskId: number };
};

export const TaskModal = ({ params }: TaskModalProps) => {
  const dispatch = useDispatch();
  const { data: task, isLoading, error } = useGetTaskQuery(params.taskId);

  const code = useMemo(() => {
    return task ? JSON.stringify(task.task_details, null, 2) : "";
  }, [task]);

  const handleClose = () => {
    dispatch(goBack());
  };

  const handleDownload = () => {
    const filename = task ? `task-${task.id}.json` : `task.json`;
    const blob = new Blob([code], { type: "text/json" });
    openSaveDialog(filename, blob);
  };

  if (isLoading || error || !task) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ModalContent title={t`Task details`} onClose={handleClose}>
      <CodeBlock code={code} language="json" />

      <Flex gap="md" justify="space-between" mt="xl">
        <Button leftSection={<Icon name="audit" />}>{t`See logs`}</Button>

        <Flex gap="md">
          <CopyButton text={code} />

          <Button
            leftSection={<Icon name="download" />}
            variant="filled"
            onClick={handleDownload}
          >{t`Download`}</Button>
        </Flex>
      </Flex>
    </ModalContent>
  );
};
