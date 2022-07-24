/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { HEADER_ACTION_STYLE, HEADER_ICON_SIZE } from "./constants";

function ToggleCardPreviewButton({ isPreviewing, onPreviewToggle }) {
  return (
    <a
      data-metabase-event="Dashboard;Text;edit"
      className="text-dark-hover cursor-pointer h3 flex-no-shrink relative mr1 drag-disabled"
      onClick={onPreviewToggle}
      style={HEADER_ACTION_STYLE}
    >
      <Tooltip tooltip={isPreviewing ? t`Edit` : t`Preview`}>
        <span className="flex align-center">
          <span className="flex" style={{ width: 18 }}>
            {isPreviewing ? (
              <Icon name="edit_document" size={HEADER_ICON_SIZE} />
            ) : (
              <Icon name="eye" size={18} />
            )}
          </span>
        </span>
      </Tooltip>
    </a>
  );
}

export default ToggleCardPreviewButton;
