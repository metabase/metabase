import React, { useCallback, useState } from "react";
import { t } from "ttag";

import title from "metabase/hoc/Title";
import { useOnMount } from "metabase/hooks/use-on-mount";
import { PublicApi } from "metabase/services";

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
  publicId: string;
  onError: (error: AppErrorDescriptor) => void;
}

function PublicAction({ action, publicId, onError }: Props) {
  const [isSubmitted, setSubmitted] = useState(false);

  const hasParameters = action.parameters.length > 0;

  const handleSubmit = useCallback(
    async (values: ParametersForActionExecution) => {
      try {
        await PublicApi.executeAction({ uuid: publicId, parameters: values });
        setSubmitted(true);
      } catch (error) {
        onError(error as AppErrorDescriptor);
      }
    },
    [publicId, onError],
  );

  useOnMount(() => {
    if (!hasParameters) {
      handleSubmit({});
    }
  });

  if (isSubmitted) {
    return (
      <FormResultMessage>{t`Thanks for your submission.`}</FormResultMessage>
    );
  }

  if (!hasParameters) {
    return null;
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
