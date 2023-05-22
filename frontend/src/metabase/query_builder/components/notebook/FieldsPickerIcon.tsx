import React from "react";
import PropTypes from "prop-types";
import styled from "@emotion/styled";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import { NotebookCell } from "./NotebookCell";

export const FieldPickerContentContainer = styled.div`
  padding: ${NotebookCell.CONTAINER_PADDING};
`;

const StyledIcon = styled(Icon)`
  opacity: 0.5;
`;

const propTypes = {
  isTriggeredComponentOpen: PropTypes.bool,
};

export function FieldsPickerIcon({
  isTriggeredComponentOpen,
}: {
  isTriggeredComponentOpen?: boolean;
}) {
  return (
    <Tooltip
      tooltip={<span>{t`Pick columns`}</span>}
      isEnabled={!isTriggeredComponentOpen}
    >
      <FieldPickerContentContainer data-testid="fields-picker">
        <StyledIcon name="chevrondown" />
      </FieldPickerContentContainer>
    </Tooltip>
  );
}

FieldsPickerIcon.propTypes = propTypes;

export const FIELDS_PICKER_STYLES = {
  notebookItemContainer: {
    padding: 0,
  },
  notebookRightItemContainer: {
    width: 37,
    height: 37,
    padding: 0,
  },
  trigger: {
    marginTop: 1,
  },
};
