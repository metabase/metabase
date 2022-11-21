/* eslint-disable react/prop-types */
import React from "react";

import Icon from "metabase/components/Icon";

const HEADER_ICON_SIZE = 16;

const HEADER_ACTION_STYLE = {
  padding: 4,
};

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
