import React, { useState } from "react";
import { t } from "ttag";

import ActionParametersInputForm from "metabase/actions/components/ActionParametersInputForm";

import type {
  ActionDashboardCard,
  Dashboard,
  OnSubmitActionForm,
  ParametersForActionExecution,
  VisualizationSettings,
  WritebackQueryAction,
  WritebackParameter,
} from "metabase-types/api";

import { getFormTitle } from "../../utils";
import ActionParametersInputModal from "../ActionParametersInputModal";
import ActionButtonView from "./ActionButtonView";
import { shouldShowConfirmation } from "./utils";

import {
  DataAppPageFormWrapper,
  DataAppPageFormTitle,
} from "./ActionForm.styled";

interface ActionFormProps {
  action: WritebackQueryAction;
  dashboard: Dashboard;
  dashcard: ActionDashboardCard;
  settings: VisualizationSettings;
  missingParameters: WritebackParameter[];
  dashcardParamValues: ParametersForActionExecution;
  shouldDisplayButton: boolean;
  isSettings: boolean;
  onSubmit: OnSubmitActionForm;
}

function ActionVizForm({
  action,
  dashboard,
  dashcard,
  onSubmit,
  settings,
  missingParameters,
  dashcardParamValues,
  shouldDisplayButton,
  isSettings,
}: ActionFormProps) {
  const [showModal, setShowModal] = useState(false);
  const title = getFormTitle(action);

  // only show confirmation if there are no missing parameters
  const showConfirmMessage =
    shouldShowConfirmation(action) && !missingParameters.length;

  const onClick = () => {
    if (missingParameters.length > 0 || showConfirmMessage) {
      setShowModal(true);
    } else {
      onSubmit({});
    }
  };

  const onModalSubmit = async (params: ParametersForActionExecution) => {
    const result = await onSubmit(params);
    if (result.success) {
      setShowModal(false);
    }
    return result;
  };

  if (shouldDisplayButton) {
    return (
      <>
        <ActionButtonView
          onClick={onClick}
          settings={settings}
          isFullHeight={!isSettings}
        />
        {showModal && (
          <ActionParametersInputModal
            onClose={() => setShowModal(false)}
            title={title}
          >
            <>
              {showConfirmMessage && (
                <ConfirmMessage
                  message={action.visualization_settings?.confirmMessage}
                />
              )}
              <ActionParametersInputForm
                onSubmit={onModalSubmit}
                dashboard={dashboard}
                dashcard={dashcard}
                missingParameters={missingParameters}
                dashcardParamValues={dashcardParamValues}
                onCancel={() => setShowModal(false)}
                action={action}
              />
            </>
          </ActionParametersInputModal>
        )}
      </>
    );
  }

  return (
    <DataAppPageFormWrapper>
      <DataAppPageFormTitle>{title}</DataAppPageFormTitle>
      <ActionParametersInputForm
        onSubmit={onSubmit}
        dashboard={dashboard}
        dashcard={dashcard}
        missingParameters={missingParameters}
        dashcardParamValues={dashcardParamValues}
        action={action}
      />
    </DataAppPageFormWrapper>
  );
}

const ConfirmMessage = ({ message }: { message?: string | null }) => (
  <div>{message ?? t`This action cannot be undone.`}</div>
);

export default ActionVizForm;
