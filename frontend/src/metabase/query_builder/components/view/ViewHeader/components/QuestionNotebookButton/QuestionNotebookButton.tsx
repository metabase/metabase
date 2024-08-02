import { t } from "ttag";

import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

type QuestionNotebookButtonProps = {
  isShowingNotebook: boolean;
  setQueryBuilderMode: (
    mode: QueryBuilderMode,
    opts?: {
      shouldUpdateUrl?: boolean;
      datasetEditorTab?: DatasetEditorTab;
    },
  ) => void;
};

export function QuestionNotebookButton({
  isShowingNotebook,
  setQueryBuilderMode,
}: QuestionNotebookButtonProps) {
  return (
    <Button
      data-testid="notebook-button"
      onClick={() =>
        setQueryBuilderMode(isShowingNotebook ? "view" : "notebook")
      }
    >
      {isShowingNotebook ? t`Show Visualization` : t`Show Editor`}
    </Button>
  );
}

QuestionNotebookButton.shouldRender = ({
  question,
  isActionListVisible,
  isBrandNew = false,
}: {
  question: Question;
  isActionListVisible: boolean;
  isBrandNew?: boolean;
}) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    !isNative &&
    isEditable &&
    isActionListVisible &&
    !question.isArchived() &&
    !isBrandNew
  );
};
