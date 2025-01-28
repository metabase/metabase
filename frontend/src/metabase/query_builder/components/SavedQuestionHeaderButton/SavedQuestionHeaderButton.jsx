import PropTypes from "prop-types";
import { t } from "ttag";

import EditableText from "metabase/core/components/EditableText";
import { QUESTION_NAME_MAX_LENGTH } from "metabase/questions/constants";
import { Flex } from "metabase/ui";

import { CollectionIcon } from "./CollectionIcon";
import SavedQuestionHeaderButtonS from "./SavedQuestionHeaderButton.module.css";

SavedQuestionHeaderButton.propTypes = {
  className: PropTypes.string,
  question: PropTypes.object.isRequired,
  onSave: PropTypes.func,
};

function SavedQuestionHeaderButton({ question, onSave }) {
  return (
    <Flex align="center" gap="0.25rem">
      <EditableText
        className={SavedQuestionHeaderButtonS.HeaderTitle}
        isDisabled={!question.canWrite() || question.isArchived()}
        initialValue={question.displayName()}
        placeholder={t`Add title`}
        maxLength={QUESTION_NAME_MAX_LENGTH}
        onChange={onSave}
        data-testid="saved-question-header-title"
      />

      <CollectionIcon
        collection={question?._card?.collection}
        question={question}
      />
    </Flex>
  );
}

export default SavedQuestionHeaderButton;
