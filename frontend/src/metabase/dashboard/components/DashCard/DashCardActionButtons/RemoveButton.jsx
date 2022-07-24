/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import DashActionButton from "./DashActionButton";

function RemoveButton({ onRemove }) {
  return (
    <DashActionButton
      analyticsEvent="Remove Card Modal"
      onClick={onRemove}
      tooltip={t`Remove`}
    >
      <DashActionButton.Icon name="close" />
    </DashActionButton>
  );
}

export default RemoveButton;
