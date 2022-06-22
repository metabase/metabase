import React from "react";
import { t } from "ttag";
import PropTypes from "prop-types";

import { PLUGIN_MODERATION } from "metabase/plugins";

import { color } from "metabase/lib/colors";

import EditableText from "../EditableText";
import {
  HeaderRoot,
  HeaderReviewIcon,
} from "./SavedQuestionHeaderButton.styled";

SavedQuestionHeaderButton.propTypes = {
  className: PropTypes.string,
  question: PropTypes.object.isRequired,
  onSave: PropTypes.func,
};

const ICON_SIZE = 16;

function SavedQuestionHeaderButton({ className, question, onSave }) {
  const {
    name: reviewIconName,
    color: reviewIconColor,
  } = PLUGIN_MODERATION.getStatusIconForQuestion(question);

  return (
    <HeaderRoot>
      <EditableText
        initialValue={question.displayName()}
        onChange={onSave}
        submitOnEnter
        placeholder={t`A nice title`}
        data-testid="saved-question-header-title"
      />
      {reviewIconName && (
        <HeaderReviewIcon
          name={reviewIconName}
          color={color(reviewIconColor)}
          size={ICON_SIZE}
        />
      )}
    </HeaderRoot>
  );
}

export default Object.assign(SavedQuestionHeaderButton, {
  Root: HeaderRoot,
});
