import type { ButtonHTMLAttributes } from "react";
import { t } from "ttag";

import { Tooltip, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

import { QuestionNotebookActionIcon } from "./QuestionNotebookButton.styled";

type QuestionNotebookButtonProps = {
  className?: string;
  question: Question;
  isShowingNotebook: boolean;
  setQueryBuilderMode: (
    mode: QueryBuilderMode,
    opts?: {
      shouldUpdateUrl?: boolean;
      datasetEditorTab?: DatasetEditorTab;
    },
  ) => void;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function QuestionNotebookButton({
  className,
  question,
  isShowingNotebook,
  setQueryBuilderMode,
  ...props
}: QuestionNotebookButtonProps) {
  return (
    <Tooltip label={isShowingNotebook ? t`Hide editor` : t`Show editor`}>
      <QuestionNotebookActionIcon
        isShowingNotebook={isShowingNotebook}
        color="brand"
        size="2rem"
        variant={isShowingNotebook ? "filled" : undefined}
        onClick={() =>
          setQueryBuilderMode(isShowingNotebook ? "view" : "notebook")
        }
        {...props}
      >
        <Icon size={14} name="notebook" />
      </QuestionNotebookActionIcon>
    </Tooltip>
  );
}

QuestionNotebookButton.shouldRender = ({
  question,
  isActionListVisible,
}: {
  question: Question;
  isActionListVisible: boolean;
}) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    !isNative && isEditable && isActionListVisible && !question.isArchived()
  );
};
