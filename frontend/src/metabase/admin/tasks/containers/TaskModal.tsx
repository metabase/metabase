import { goBack } from "react-router-redux";
import { t } from "ttag";

import { useGetTaskQuery } from "metabase/api";
import Code from "metabase/components/Code";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";

type TaskModalProps = {
  params: { taskId: number };
};

export const TaskModal = ({ params }: TaskModalProps) => {
  const dispatch = useDispatch();
  const { data, isLoading, error } = useGetTaskQuery(params.taskId);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!data) {
    return null;
  }

  return (
    <ModalContent title={t`Task details`} onClose={() => dispatch(goBack())}>
      <Code>{JSON.stringify(data.task_details)}</Code>
    </ModalContent>
  );
};
