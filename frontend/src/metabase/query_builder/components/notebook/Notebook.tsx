import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { Box, Button } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { NotebookSteps } from "./NotebookSteps";

export type NotebookProps = {
  question: Question;
  isDirty: boolean;
  isRunnable: boolean;
  isResultDirty: boolean;
  reportTimezone: string;
  hasVisualizeButton?: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery: () => void;
  setQueryBuilderMode: (mode: string) => void;
  readOnly?: boolean;
};

const Notebook = ({
  updateQuestion,
  reportTimezone,
  readOnly,
  question,
  isDirty,
  isRunnable,
  isResultDirty,
  hasVisualizeButton = true,
  runQuestionQuery,
  setQueryBuilderMode,
}: NotebookProps) => {
  const dispatch = useDispatch();

  async function cleanupQuestion() {
    // Converting a query to MLv2 and back performs a clean-up
    let cleanQuestion = question.setQuery(
      Lib.dropEmptyStages(question.query()),
    );

    if (cleanQuestion.display() === "table") {
      cleanQuestion = cleanQuestion.setDefaultDisplay();
    }

    await updateQuestion(cleanQuestion);
  }

  // visualize switches the view to the question's visualization.
  async function visualize() {
    // Only cleanup the question if it's dirty, otherwise Metabase
    // will incorrectly display the Save button, even though there are no changes to save.
    if (isDirty) {
      cleanupQuestion();
    }
    // switch mode before running otherwise URL update may cause it to switch back to notebook mode
    await setQueryBuilderMode("view");
    if (isResultDirty) {
      await runQuestionQuery();
    }
  }

  const handleUpdateQuestion = (question: Question): Promise<void> => {
    dispatch(setUIControls({ isModifiedFromNotebook: true }));
    return updateQuestion(question);
  };

  return (
    <Box pos="relative" p={{ base: "1rem", sm: "2rem" }}>
      <NotebookSteps
        updateQuestion={handleUpdateQuestion}
        question={question}
        reportTimezone={reportTimezone}
        readOnly={readOnly}
      />
      {hasVisualizeButton && isRunnable && (
        <Button variant="filled" style={{ minWidth: 220 }} onClick={visualize}>
          {t`Visualize`}
        </Button>
      )}
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Notebook;
