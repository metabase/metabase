import { t } from "ttag";

import EditableText from "metabase/core/components/EditableText";
import { QUESTION_NAME_MAX_LENGTH } from "metabase/questions/constants";
import { useTranslateContent } from "metabase/i18n/components/ContentTranslationContext";
import { Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { CollectionIcon } from "./CollectionIcon";
import SavedQuestionHeaderButtonS from "./SavedQuestionHeaderButton.module.css";

interface SavedQuestionHeaderButtonProps {
  question: Question;
  onSave: (name: string) => void;
}

function SavedQuestionHeaderButton({
  question,
  onSave,
}: SavedQuestionHeaderButtonProps) {
  const tc = useTranslateContent();
  return (
    <Flex align="center" gap="0.25rem">
      <EditableText
        className={SavedQuestionHeaderButtonS.HeaderTitle}
        isDisabled={!question.canWrite() || question.isArchived()}
        initialValue={tc(question._card, "name")}
        placeholder={t`Add title`}
        maxLength={QUESTION_NAME_MAX_LENGTH}
        onChange={onSave}
        data-testid="saved-question-header-title"
      />

      <CollectionIcon collection={question.collection()} question={question} />
    </Flex>
  );
}

export { SavedQuestionHeaderButton };
