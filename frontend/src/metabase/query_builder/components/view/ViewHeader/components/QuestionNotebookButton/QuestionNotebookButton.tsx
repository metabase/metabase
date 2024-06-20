import { t } from "ttag";

import { Tooltip, Icon, ActionIcon } from "metabase/ui";
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
    <Tooltip
      label={isShowingNotebook ? t`Hide editor` : t`Show editor`}
      data-placement="top"
      position="top"
    >
      <ActionIcon
        color="brand"
        size="2rem"
        variant={isShowingNotebook ? "filled" : "viewHeader"}
        onClick={() =>
          setQueryBuilderMode(isShowingNotebook ? "view" : "notebook")
        }
      >
        <Icon size={14} name="notebook" />
      </ActionIcon>
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
