import React from "react";
import PropTypes from "prop-types";

import { PLUGIN_MODERATION } from "metabase/plugins";
import EditableText from "../EditableText/EditableText";

import {
  HeaderRoot,
  HeaderReviewIcon,
} from "./SavedQuestionHeaderButton.styled";

import { color } from "metabase/lib/colors";

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
