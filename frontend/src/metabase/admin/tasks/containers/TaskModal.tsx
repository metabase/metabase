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

  return (
    <>
      {(isLoading || error) && (
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      )}
      {data && (
        <ModalContent
          title={t`Task details`}
          onClose={() => dispatch(goBack())}
        >
          <Code>{JSON.stringify(data.task_details)}</Code>
        </ModalContent>
      )}
    </>
  );
};
