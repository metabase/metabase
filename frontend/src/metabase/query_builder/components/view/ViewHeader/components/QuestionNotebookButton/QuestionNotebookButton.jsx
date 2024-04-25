/* eslint-disable react/prop-types */
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import * as Lib from "metabase-lib";

import { ButtonRoot } from "./QuestionNotebookButton.styled";

export function QuestionNotebookButton({
  className,
  question,
  isShowingNotebook,
  setQueryBuilderMode,
  ...props
}) {
  return (
    <Tooltip
      tooltip={isShowingNotebook ? t`Hide editor` : t`Show editor`}
      placement="top"
    >
      <ButtonRoot
        borderless={!isShowingNotebook}
        primary={isShowingNotebook}
        medium
        isSelected={isShowingNotebook}
        className={className}
        icon="notebook"
        onClick={() =>
          setQueryBuilderMode(isShowingNotebook ? "view" : "notebook")
        }
        {...props}
      />
    </Tooltip>
  );
}

QuestionNotebookButton.shouldRender = ({ question, isActionListVisible }) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return !isNative && isEditable && isActionListVisible;
};
