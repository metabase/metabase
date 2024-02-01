/* eslint-disable react/prop-types */
import { t } from "ttag";

import * as Lib from "metabase-lib";
import Tooltip from "metabase/core/components/Tooltip";
import { ButtonRoot } from "./QuestionNotebookButton.styled";

export function QuestionNotebookButton({
  className,
  question,
  isShowingNotebook,
  setQueryBuilderMode,
  ...props
}) {
  const label = isShowingNotebook ? t`Hide editor` : t`Show editor`;
  return (
    <Tooltip tooltip={label} placement="top">
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
        data-palette-name={label}
        {...props}
      />
    </Tooltip>
  );
}

QuestionNotebookButton.shouldRender = ({ question, isActionListVisible }) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return !isNative && isEditable && isActionListVisible;
};
