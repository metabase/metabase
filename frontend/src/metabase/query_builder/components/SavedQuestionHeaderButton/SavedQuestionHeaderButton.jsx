import React from "react";
import { t } from "ttag";
import PropTypes from "prop-types";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { HeaderRoot, HeaderTitle } from "./SavedQuestionHeaderButton.styled";

SavedQuestionHeaderButton.propTypes = {
  className: PropTypes.string,
  question: PropTypes.object.isRequired,
  isRenamingDisabled: PropTypes.bool,
  onSave: PropTypes.func,
};

function SavedQuestionHeaderButton({ question, isRenamingDisabled, onSave }) {
  return (
    <HeaderRoot>
      <HeaderTitle
        isDisabled={!question.canWrite() || isRenamingDisabled}
        initialValue={question.displayName()}
        placeholder={t`Add title`}
        onChange={onSave}
        data-testid="saved-question-header-title"
      />
      <PLUGIN_MODERATION.QuestionModerationIcon question={question} />
    </HeaderRoot>
  );
}

export default Object.assign(SavedQuestionHeaderButton, {
  Root: HeaderRoot,
});
