import React from "react";
import styled from "styled-components";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

const StyledIcon = styled(Icon)`
  opacity: 0.5;
`;

export function FieldsPickerIcon() {
  return (
    <Tooltip tooltip={<span>{t`Pick columns`}</span>}>
      <StyledIcon name="table" size={14} />
    </Tooltip>
  );
}

export const FIELDS_PICKER_STYLES = {
  notebookItemContainer: {
    width: 37,
    height: 37,
  },
  trigger: {
    marginTop: 1,
  },
};
