import { cleanQuestion } from "metabase/query_builder/utils/question";
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
    await updateQuestion(cleanQuestion(question));
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
