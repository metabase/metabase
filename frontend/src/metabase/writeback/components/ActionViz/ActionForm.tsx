import React, { useState } from "react";

import type {
  WritebackQueryAction,
  WritebackParameter,
  OnSubmitActionForm,
  ActionDashboardCard,
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
  missingParameters: WritebackParameter[];
  action: WritebackQueryAction;
  shouldDisplayButton: boolean;
}

function ActionForm({
  onSubmit,
  dashcard,
  missingParameters,
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
              onSubmit={onSubmit}
              missingParameters={missingParameters}
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
        missingParameters={missingParameters}
        action={action}
      />
    </DataAppPageFormWrapper>
  );
}

export default ActionForm;
