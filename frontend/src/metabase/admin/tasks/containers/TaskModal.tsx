import { useMemo } from "react";
import { goBack } from "react-router-redux";
import { t } from "ttag";

import { useGetTaskQuery } from "metabase/api";
import { CodeBlock } from "metabase/components/CodeBlock";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";
import { Button, Flex, Icon } from "metabase/ui";

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

  if (isLoading || error || !task) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ModalContent title={t`Task details`} onClose={handleClose}>
      <CodeBlock language="json" code={code} />

      <Flex gap="md" justify="space-between" mt="xl">
        <Button leftSection={<Icon name="audit" />}>{t`See logs`}</Button>

        <Flex gap="md">
          <Button leftSection={<Icon name="download" />}>{t`Download`}</Button>
          <Button leftSection={<Icon name="clipboard" />}>{t`Copy`}</Button>
        </Flex>
      </Flex>
    </ModalContent>
  );
};
