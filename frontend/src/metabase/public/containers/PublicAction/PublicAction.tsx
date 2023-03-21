import React, { useCallback, useMemo, useState } from "react";

import title from "metabase/hoc/Title";
import { PublicApi } from "metabase/services";

import { ActionForm } from "metabase/actions/components/ActionForm";
import {
  generateFieldSettingsFromParameters,
  getSuccessMessage,
  setNumericValues,
} from "metabase/actions/utils";

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
  const successMessage = getSuccessMessage(action);

  const formSettings = useMemo(() => {
    const actionSettings = action.visualization_settings || {};
    const fieldSettings =
      actionSettings.fields ||
      generateFieldSettingsFromParameters(action.parameters);
    return {
      ...actionSettings,
      fields: fieldSettings,
    };
  }, [action]);

  const handleSubmit = useCallback(
    async (values: ParametersForActionExecution) => {
      try {
        const parameters = setNumericValues(values, formSettings.fields);
        await PublicApi.executeAction({ uuid: publicId, parameters });
        setSubmitted(true);
      } catch (error) {
        onError(error as AppErrorDescriptor);
      }
    },
    [publicId, formSettings, onError],
  );

  if (isSubmitted) {
    return <FormResultMessage>{successMessage}</FormResultMessage>;
  }

  return (
    <FormContainer>
      <FormTitle>{action.name}</FormTitle>
      <ActionForm
        submitTitle={action.name}
        parameters={action.parameters}
        formSettings={formSettings}
        onSubmit={handleSubmit}
      />
    </FormContainer>
  );
}

const getPageTitle = ({ action }: Props) => action.name;

export default title(getPageTitle)(PublicAction);
