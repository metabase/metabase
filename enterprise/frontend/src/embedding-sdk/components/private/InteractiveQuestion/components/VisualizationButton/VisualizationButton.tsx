import { useMemo } from "react";
import { t } from "ttag";

import {
  isQuestionDirty,
  isQuestionRunnable,
} from "metabase/query_builder/utils/question";
import { Button } from "metabase/ui";

import { useInteractiveQuestionContext } from "../../context";
import { useRunVisualization } from "../../hooks/use-run-visualization";

export const VisualizationButton = () => {
  const { question, originalQuestion } = useInteractiveQuestionContext();
  const { visualizeQuestion } = useRunVisualization();

  const isRunnable = useMemo(
    () =>
      isQuestionRunnable(question, isQuestionDirty(question, originalQuestion)),
    [question, originalQuestion],
  );

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
