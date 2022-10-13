import React, { useState } from "react";

import type {
  WritebackQueryAction,
  WritebackParameter,
  OnSubmitActionForm,
  ActionDashboardCard,
  ParametersForActionExecution,
  Dashboard,
} from "metabase-types/api";
import { getFormTitle } from "metabase/writeback/components/ActionCreator/FormCreator";

import ActionParametersInputForm from "../../containers/ActionParametersInputForm";
import ActionParametersInputModal from "../../containers/ActionParametersInputModal";
import ActionButtonView from "./ActionButtonView";

import {
  DataAppPageFormWrapper,
  DataAppPageFormTitle,
} from "./ActionForm.styled";

interface ActionFormProps {
  onSubmit: OnSubmitActionForm;
  dashcard: ActionDashboardCard;
  dashboard: Dashboard;
  missingParameters: WritebackParameter[];
  dashcardParamValues: ParametersForActionExecution;
  action: WritebackQueryAction;
  shouldDisplayButton: boolean;
}

function ActionForm({
  onSubmit,
  dashcard,
  dashboard,
  missingParameters,
  dashcardParamValues,
  action,
  shouldDisplayButton,
}: ActionFormProps) {
  const [showModal, setShowModal] = useState(false);
  const title = getFormTitle(action);

  const onClick = () => {
    if (missingParameters.length > 0) {
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
          settings={dashcard.visualization_settings}
        />
        {showModal && (
          <ActionParametersInputModal
            onClose={() => setShowModal(false)}
            title={title}
          >
            <ActionParametersInputForm
              onSubmit={onModalSubmit}
              dashboard={dashboard}
              dashcard={dashcard}
              missingParameters={missingParameters}
              dashcardParamValues={dashcardParamValues}
              action={action}
            />
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

export default ActionForm;
