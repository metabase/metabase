/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import { HEADER_ICON_SIZE } from "./constants";
import DashActionButton from "./DashActionButton";

function ToggleCardPreviewButton({ isPreviewing, onPreviewToggle }) {
  return (
    <DashActionButton
      className="h3 flex-no-shrink relative mr1"
      onClick={onPreviewToggle}
      tooltip={isPreviewing ? t`Edit` : t`Preview`}
      analyticsEvent="Text;edit"
    >
      <span className="flex align-center">
        <span className="flex" style={{ width: 18 }}>
          {isPreviewing ? (
            <Icon name="edit_document" size={HEADER_ICON_SIZE} />
          ) : (
            <Icon name="eye" size={18} />
          )}
        </span>
      </span>
    </DashActionButton>
  );
}

export default ToggleCardPreviewButton;
