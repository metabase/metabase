import React from "react";

import { getFormTitle } from "metabase/actions/utils";
import ActionExecuteModal from "metabase/actions/containers/ActionExecuteModal";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";

import type {
  ActionDashboardCard,
  OnSubmitActionForm,
  Dashboard,
  ParametersForActionExecution,
  VisualizationSettings,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

import ActionParametersInputForm from "../../containers/ActionParametersInputForm";

import ActionButtonView from "./ActionButtonView";
import { FormWrapper, FormTitle } from "./ActionForm.styled";

interface ActionFormProps {
  action: WritebackAction;
  dashcard: ActionDashboardCard;
  dashboard: Dashboard;
  mappedParameters?: WritebackParameter[];
  dashcardParamValues: ParametersForActionExecution;
  settings: VisualizationSettings;
  isSettings: boolean;
  shouldDisplayButton: boolean;
  isEditingDashcard: boolean;
  onSubmit: OnSubmitActionForm;
}

function ActionVizForm({
  action,
  dashcard,
  dashboard,
  settings,
  mappedParameters = [],
  dashcardParamValues,
  isSettings,
  shouldDisplayButton,
  isEditingDashcard,
  onSubmit,
}: ActionFormProps) {
  const title = getFormTitle(action);

  if (shouldDisplayButton) {
    return (
      <ModalWithTrigger
        triggerElement={
          <ActionButtonView
            settings={settings}
            isFullHeight={!isSettings}
            focus={isEditingDashcard}
          />
        }
      >
        {({ onClose }) => (
          <ActionExecuteModal actionId={action.id} onClose={onClose} />
        )}
      </ModalWithTrigger>
    );
  }

  return (
    <FormWrapper>
      <FormTitle>{title}</FormTitle>
      <ActionParametersInputForm
        action={action}
        dashboard={dashboard}
        dashcard={dashcard}
        mappedParameters={mappedParameters}
        dashcardParamValues={dashcardParamValues}
        onSubmit={onSubmit}
      />
    </FormWrapper>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionVizForm;
