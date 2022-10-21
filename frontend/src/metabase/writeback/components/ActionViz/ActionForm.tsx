import React, { useState } from "react";
import { t } from "ttag";

import type {
  WritebackQueryAction,
  WritebackParameter,
  OnSubmitActionForm,
  ActionDashboardCard,
  ParametersForActionExecution,
  DataAppPage,
} from "metabase-types/api";
import { getFormTitle } from "metabase/writeback/components/ActionCreator/FormCreator";

import ActionParametersInputForm from "../../containers/ActionParametersInputForm";
import ActionParametersInputModal from "../../containers/ActionParametersInputModal";
import ActionButtonView from "./ActionButtonView";
import { shouldShowConfirmation } from "./utils";

import {
  DataAppPageFormWrapper,
  DataAppPageFormTitle,
} from "./ActionForm.styled";

interface ActionFormProps {
  onSubmit: OnSubmitActionForm;
  dashcard: ActionDashboardCard;
  page: DataAppPage;
  missingParameters: WritebackParameter[];
  dashcardParamValues: ParametersForActionExecution;
  action: WritebackQueryAction;
  shouldDisplayButton: boolean;
}

function ActionForm({
  onSubmit,
  dashcard,
  page,
  missingParameters,
  dashcardParamValues,
  action,
  shouldDisplayButton,
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
          settings={dashcard.visualization_settings}
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
                page={page}
                dashcard={dashcard}
                missingParameters={missingParameters}
                dashcardParamValues={dashcardParamValues}
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
        page={page}
        dashcard={dashcard}
        missingParameters={missingParameters}
        dashcardParamValues={dashcardParamValues}
        action={action}
      />
    </DataAppPageFormWrapper>
  );
}

const ConfirmMessage = ({ message }: { message?: string | null }) => (
  <div>{message ?? t`Are you sure?`}</div>
);

export default ActionForm;
