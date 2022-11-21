import React from "react";
import { t } from "ttag";

import DashCardActionButton from "./DashCardActionButton";

function ToggleCardPreviewButton({
  isPreviewing,
  onPreviewToggle,
}: {
  isPreviewing: boolean;
  onPreviewToggle: () => void;
}) {
  return (
    <DashCardActionButton
      onClick={onPreviewToggle}
      tooltip={isPreviewing ? t`Edit` : t`Preview`}
      analyticsEvent="Dashboard;Text;edit"
    >
      {isPreviewing ? (
        <DashCardActionButton.Icon name="edit_document" />
      ) : (
        <DashCardActionButton.Icon name="eye" size={18} />
      )}
    </DashCardActionButton>
  );
}

export default ToggleCardPreviewButton;
