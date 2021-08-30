import React from "react";
import styled from "styled-components";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { NotebookCell } from "./NotebookCell";

const IconContainer = styled.div`
  padding: ${NotebookCell.CONTAINER_PADDING};
`;

const StyledIcon = styled(Icon)`
  opacity: 0.5;
`;

export function FieldsPickerIcon() {
  return (
    <Tooltip tooltip={<span>{t`Pick columns`}</span>}>
      <IconContainer>
        <StyledIcon name="table" size={14} />
      </IconContainer>
    </Tooltip>
  );
}

export const FIELDS_PICKER_STYLES = {
  notebookItemContainer: {
    width: 37,
    height: 37,
    padding: 0,
  },
  trigger: {
    marginTop: 1,
  },
};
