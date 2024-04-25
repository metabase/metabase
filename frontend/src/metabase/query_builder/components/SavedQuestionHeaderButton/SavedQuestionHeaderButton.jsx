import PropTypes from "prop-types";
import { t } from "ttag";

import { CollectionIcon } from "./CollectionIcon";
import { HeaderRoot, HeaderTitle } from "./SavedQuestionHeaderButton.styled";

SavedQuestionHeaderButton.propTypes = {
  className: PropTypes.string,
  question: PropTypes.object.isRequired,
  onSave: PropTypes.func,
};

function SavedQuestionHeaderButton({ question, onSave }) {
  return (
    <HeaderRoot>
      <HeaderTitle
        isDisabled={!question.canWrite()}
        initialValue={question.displayName()}
        placeholder={t`Add title`}
        onChange={onSave}
        data-testid="saved-question-header-title"
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
