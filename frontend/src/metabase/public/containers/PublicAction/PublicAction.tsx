import { useCallback, useState } from "react";

import ActionForm from "metabase/actions/components/ActionForm";
import { getSuccessMessage } from "metabase/actions/utils";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { PublicApi } from "metabase/services";
import type {
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";
import type { AppErrorDescriptor } from "metabase-types/store";

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
  const [isSubmitted, setSubmitted] = useState(false);
  const successMessage = getSuccessMessage(action);

  usePageTitle(action.name);

  const handleSubmit = useCallback(
    async (parameters: ParametersForActionExecution) => {
      try {
        await PublicApi.executeAction({ uuid: publicId, parameters });
        setSubmitted(true);
      } catch (error) {
        onError(error as AppErrorDescriptor);
      }
    },
    [publicId, onError],
  );

  if (isSubmitted) {
    return <FormResultMessage>{successMessage}</FormResultMessage>;
  }

  return (
    <FormContainer>
      <FormTitle>{action.name}</FormTitle>
      <ActionForm action={action} onSubmit={handleSubmit} />
    </FormContainer>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PublicAction;
