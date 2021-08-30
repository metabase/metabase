import React from "react";
import PropTypes from "prop-types";
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

const propTypes = {
  isTriggeredComponentOpen: PropTypes.bool,
};

export function FieldsPickerIcon({ isTriggeredComponentOpen }) {
  return (
    <Tooltip
      tooltip={<span>{t`Pick columns`}</span>}
      isEnabled={!isTriggeredComponentOpen}
    >
      <IconContainer>
        <StyledIcon name="table" size={14} />
      </IconContainer>
    </Tooltip>
  );
}

FieldsPickerIcon.propTypes = propTypes;

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
