import { t } from "ttag";

import EditableText from "metabase/core/components/EditableText";
import { QUESTION_NAME_MAX_LENGTH } from "metabase/questions/constants";
import { Box, Flex } from "metabase/ui";
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
  return (
    <Flex
      align="center"
      gap="0.25rem"
      style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}
    >
      <Box style={{ overflow: "hidden", maxWidth: "calc(100% - 24px)" }}>
        <EditableText
          className={SavedQuestionHeaderButtonS.HeaderTitle}
          isDisabled={!question.canWrite() || question.isArchived()}
          initialValue={question.displayName()}
          placeholder={t`Add title`}
          maxLength={QUESTION_NAME_MAX_LENGTH}
          onChange={onSave}
          data-testid="saved-question-header-title"
        />
      </Box>

      <CollectionIcon collection={question.collection()} question={question} />
    </Flex>
  );
}

export { SavedQuestionHeaderButton };
