import { goBack } from "react-router-redux";
import { t } from "ttag";

import { useGetTaskQuery } from "metabase/api";
import Code from "metabase/components/Code";
import ModalContent from "metabase/components/ModalContent";
import { useDispatch } from "metabase/lib/redux";
import { Center, Loader } from "metabase/ui";

type TaskModalProps = {
  params: { taskId: number };
};

export const TaskModal = ({ params }: TaskModalProps) => {
  const dispatch = useDispatch();
  const { data, isFetching } = useGetTaskQuery(params.taskId);

  if (!data) {
    return null;
  }

  return (
    <ModalContent title={t`Task details`} onClose={() => dispatch(goBack())}>
      {isFetching && (
        <Center h="4rem">
          <Loader data-testid="loading-spinner" size="2rem" />
        </Center>
      )}
      {!isFetching && data && <Code>{JSON.stringify(data.task_details)}</Code>}
    </ModalContent>
  );
};
