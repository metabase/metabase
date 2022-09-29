import React from "react";

import type {
  ArbitraryParameterForActionExecution,
  WritebackQueryAction,
  WritebackParameter,
  OnSubmitActionForm,
} from "metabase-types/api";

import ActionParametersInputForm from "../../containers/ActionParametersInputForm";
import {
  DataAppPageFormWrapper,
  DataAppPageFormTitle,
} from "./ActionForm.styled";

interface ActionFormProps {
  onSubmit: OnSubmitActionForm;
  missingParameters: WritebackParameter[];
  action: WritebackQueryAction;
}

function ActionForm({ onSubmit, missingParameters, action }: ActionFormProps) {
  return (
    <DataAppPageFormWrapper>
      <DataAppPageFormTitle>{action.name}</DataAppPageFormTitle>
      <ActionParametersInputForm
        onSubmit={onSubmit}
        missingParameters={missingParameters}
        action={action}
      />
    </DataAppPageFormWrapper>
  );
}

export default ActionForm;
