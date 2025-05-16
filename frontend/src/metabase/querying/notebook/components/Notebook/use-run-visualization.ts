import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type UseVisualizationProps = {
  question?: Question;
  isDirty: boolean;
  isResultDirty: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery: () => Promise<void>;
  setQueryBuilderMode?: (mode: string) => void;
};

export const useRunVisualization = ({
  question,
  isDirty,
  isResultDirty,
  updateQuestion,
  runQuestionQuery,
  setQueryBuilderMode,
}: UseVisualizationProps) => {
  const cleanupQuestion = async () => {
    if (!question) {
      return;
    }
    // Converting a query to MLv2 and back performs a clean-up
    let cleanQuestion = question.setQuery(
      Lib.dropEmptyStages(question.query()),
    );
    if (cleanQuestion.display() === "table") {
      cleanQuestion = cleanQuestion.setDefaultDisplay();
    }
    await updateQuestion(cleanQuestion);
  };

  // visualize switches the view to the question's visualization.
  const visualizeQuestion = async () => {
    // Only cleanup the question if it's dirty, otherwise Metabase
    // will incorrectly display the Save button, even though there are no changes to save.
    if (isDirty) {
      await cleanupQuestion();
    }
    // switch mode before running otherwise URL update may cause it to switch back to notebook mode
    await setQueryBuilderMode?.("view");
    if (isResultDirty) {
      await runQuestionQuery();
    }
  };

  return {
    visualizeQuestion,
  };
};
