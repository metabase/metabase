/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import { HEADER_ICON_SIZE } from "./constants";
import DashActionButton from "./DashActionButton";

function RemoveButton({ onRemove }) {
  return (
    <DashActionButton
      analyticsEvent="Remove Card Modal"
      onClick={onRemove}
      tooltip={t`Remove`}
    >
      <Icon name="close" size={HEADER_ICON_SIZE} />
    </DashActionButton>
  );
}

export default RemoveButton;
