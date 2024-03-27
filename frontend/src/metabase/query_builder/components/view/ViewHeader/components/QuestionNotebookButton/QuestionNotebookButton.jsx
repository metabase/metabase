/* eslint-disable react/prop-types */
import { t } from "ttag";

import { Tooltip, ActionIcon, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

export function QuestionNotebookButton({
  isShowingNotebook,
  setQueryBuilderMode,
}) {
  return (
    <Tooltip
      label={isShowingNotebook ? t`Hide editor` : t`Show editor`}
      position="top"
    >
      <ActionIcon
        size="2rem"
        variant={isShowingNotebook ? "filled" : "transparent"}
        onClick={() =>
          setQueryBuilderMode(isShowingNotebook ? "view" : "notebook")
        }
      >
        <Icon name="notebook" size="1rem" />
      </ActionIcon>
    </Tooltip>
  );
}

QuestionNotebookButton.shouldRender = ({ question, isActionListVisible }) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return !isNative && isEditable && isActionListVisible;
};
