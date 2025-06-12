// VisualizeButton.tsx
import { t } from "ttag";

import { Button } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { useRunVisualization } from "./use-run-visualization";

type VisualizeButtonProps = {
  question: Question;
  isDirty: boolean;
  isRunnable: boolean;
  isResultDirty: boolean;
  updateQuestion: (question: Question) => Promise<void>;
  runQuestionQuery: () => Promise<void>;
  setQueryBuilderMode?: (mode: string) => void;
};

export const VisualizeButton = ({
  question,
  isDirty,
  isRunnable,
  isResultDirty,
  updateQuestion,
  runQuestionQuery,
  setQueryBuilderMode,
}: VisualizeButtonProps) => {
  const { visualizeQuestion } = useRunVisualization({
    question,
    isDirty,
    isResultDirty,
    updateQuestion,
    runQuestionQuery,
    setQueryBuilderMode,
  });

  if (!isRunnable) {
    return null;
  }

  return (
    <Button
      variant="filled"
      style={{ minWidth: 220 }}
      onClick={visualizeQuestion}
    >
      {t`Visualize`}
    </Button>
  );
};
