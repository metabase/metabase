/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import { HEADER_ACTION_STYLE, HEADER_ICON_SIZE } from "./constants";

function RemoveButton({ onRemove }) {
  return (
    <a
      className="text-dark-hover drag-disabled"
      data-metabase-event="Dashboard;Remove Card Modal"
      onClick={onRemove}
      style={HEADER_ACTION_STYLE}
    >
      <Icon name="close" size={HEADER_ICON_SIZE} />
    </a>
  );
}

export default RemoveButton;
