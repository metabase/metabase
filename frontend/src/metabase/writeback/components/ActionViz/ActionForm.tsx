import React from "react";

import type {
  ArbitraryParameterForActionExecution,
  WritebackQueryAction,
  WritebackParameter,
  OnSubmitActionForm,
} from "metabase-types/api";

import ActionParametersInputForm from "../../containers/ActionParametersInputForm";
import { DashboardFormWrapper, DashboardFormTitle } from "./ActionForm.styled";

interface ActionFormProps {
  onSubmit: OnSubmitActionForm;
  missingParameters: WritebackParameter[];
  action: WritebackQueryAction;
}

function ActionForm({ onSubmit, missingParameters, action }: ActionFormProps) {
  return (
    <DashboardFormWrapper>
      <DashboardFormTitle>{action.name}</DashboardFormTitle>
      <ActionParametersInputForm
        onSubmit={onSubmit}
        missingParameters={missingParameters}
        action={action}
      />
    </DashboardFormWrapper>
  );
}

export default ActionForm;
