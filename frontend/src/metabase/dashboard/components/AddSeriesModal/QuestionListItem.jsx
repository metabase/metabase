import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";
import CheckBox from "metabase/components/CheckBox";

import {
  QuestionListItemRoot,
  CheckboxContainer,
  WarningIcon,
} from "./QuestionListItem.styled";

const propTypes = {
  question: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  isEnabled: PropTypes.bool,
  isBad: PropTypes.bool,
  style: PropTypes.object,
};

export const QuestionListItem = React.memo(function QuestionListItem({
  question,
  onChange,
  isEnabled,
  isBad,
  style,
}) {
  return (
    <QuestionListItemRoot style={style} isDisabled={isBad}>
      <CheckboxContainer>
        <CheckBox
          label={question.displayName()}
          checked={isEnabled}
          onChange={onChange}
        />
      </CheckboxContainer>
      {!question.isStructured() && (
        <Tooltip tooltip={t`We're not sure if this question is compatible`}>
          <WarningIcon />
        </Tooltip>
      )}
    </QuestionListItemRoot>
  );
});

QuestionListItem.propTypes = propTypes;
