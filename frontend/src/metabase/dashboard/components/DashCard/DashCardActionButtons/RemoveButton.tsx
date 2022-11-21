import React from "react";
import { t } from "ttag";

import DashCardActionButton from "./DashCardActionButton";

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <DashCardActionButton
      onClick={onRemove}
      tooltip={t`Remove`}
      analyticsEvent="Dashboard;Remove Card Modal"
    >
      <DashCardActionButton.Icon name="close" />
    </DashCardActionButton>
  );
}

export default RemoveButton;
