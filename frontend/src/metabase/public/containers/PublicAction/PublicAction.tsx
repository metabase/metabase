import { useCallback, useState } from "react";

import ActionForm from "metabase/actions/components/ActionForm";
import { getSuccessMessage } from "metabase/actions/utils";
import { publicApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/redux";
import type { AppErrorDescriptor } from "metabase/redux/store";
import type {
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import {
  FormContainer,
  FormResultMessage,
  FormTitle,
} from "./PublicAction.styled";

interface Props {
  action: WritebackAction;
  publicId: string;
  onError: (error: AppErrorDescriptor) => void;
}

function PublicAction({ action, publicId, onError }: Props) {
  const dispatch = useDispatch();
  const [isSubmitted, setSubmitted] = useState(false);
  const successMessage = getSuccessMessage(action);

  usePageTitle(action.name);

  const handleSubmit = useCallback(
    async (parameters: ParametersForActionExecution) => {
      try {
        await runRtkEndpoint(
          { uuid: publicId, parameters },
          dispatch,
          publicApi.endpoints.executePublicAction,
        );
        setSubmitted(true);
      } catch (error) {
        onError(error as AppErrorDescriptor);
      }
    },
    [publicId, onError, dispatch],
  );

  if (isSubmitted) {
    return <FormResultMessage>{successMessage}</FormResultMessage>;
  }

  return (
    <FormContainer>
      <FormTitle>{action.name}</FormTitle>
      <ActionForm
        action={action}
        submitButtonFullWidth
        onSubmit={handleSubmit}
      />
    </FormContainer>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PublicAction;
