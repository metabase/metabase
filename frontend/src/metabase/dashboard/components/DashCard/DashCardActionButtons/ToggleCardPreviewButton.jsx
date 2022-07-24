/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import { t } from "ttag";

import DashActionButton from "./DashActionButton";

function ToggleCardPreviewButton({ isPreviewing, onPreviewToggle }) {
  return (
    <DashActionButton
      className="mr1"
      onClick={onPreviewToggle}
      tooltip={isPreviewing ? t`Edit` : t`Preview`}
      analyticsEvent="Text;edit"
    >
      {isPreviewing ? (
        <DashActionButton.Icon name="edit_document" />
      ) : (
        <DashActionButton.Icon name="eye" size={18} />
      )}
    </DashActionButton>
  );
}

export default ToggleCardPreviewButton;
