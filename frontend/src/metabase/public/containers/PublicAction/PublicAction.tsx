import React, { useCallback, useState } from "react";
import { t } from "ttag";

import title from "metabase/hoc/Title";

import { ActionForm } from "metabase/actions/components/ActionForm";

import type {
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";
import type { AppErrorDescriptor } from "metabase-types/store";

import {
  FormContainer,
  FormTitle,
  FormResultMessage,
} from "./PublicAction.styled";

interface Props {
  action: WritebackAction;
  onError: (error: AppErrorDescriptor) => void;
}

function PublicAction({ action, onError }: Props) {
  const [isSubmitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(
    (values: ParametersForActionExecution) => {
      try {
        setSubmitted(true);
      } catch (error) {
        onError(error as AppErrorDescriptor);
      }
    },
    [onError],
  );

  if (isSubmitted) {
    return (
      <FormResultMessage>{t`Thanks for your submission.`}</FormResultMessage>
    );
  }

  return (
    <FormContainer>
      <FormTitle>{action.name}</FormTitle>
      <ActionForm
        parameters={action.parameters}
        formSettings={action.visualization_settings}
        onSubmit={handleSubmit}
      />
    </FormContainer>
  );
}

const getPageTitle = ({ action }: Props) => action.name;

export default title(getPageTitle)(PublicAction);
