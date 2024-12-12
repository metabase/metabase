import PropTypes from "prop-types";
import { t } from "ttag";
import * as Yup from "yup";

import * as Errors from "metabase/lib/errors";
import { QUESTION_TITLE_MAX_LENGTH } from "metabase/questions/constants";

import { CollectionIcon } from "./CollectionIcon";
import { HeaderRoot, HeaderTitle } from "./SavedQuestionHeaderButton.styled";

SavedQuestionHeaderButton.propTypes = {
  className: PropTypes.string,
  question: PropTypes.object.isRequired,
  onSave: PropTypes.func,
};

const TITLE_SCHEMA = Yup.string()
  .required(Errors.required)
  .max(QUESTION_TITLE_MAX_LENGTH, Errors.maxLength)
  .default("");

function SavedQuestionHeaderButton({ question, onSave }) {
  return (
    <HeaderRoot>
      <HeaderTitle
        isDisabled={!question.canWrite() || question.isArchived()}
        initialValue={question.displayName()}
        placeholder={t`Add title`}
        onChange={onSave}
        data-testid="saved-question-header-title"
        validationSchema={TITLE_SCHEMA}
      />

      <CollectionIcon
        collection={question?._card?.collection}
        question={question}
      />
    </HeaderRoot>
  );
}

export default Object.assign(SavedQuestionHeaderButton, {
  Root: HeaderRoot,
});
