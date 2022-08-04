/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";
import { NotebookButton } from "./QuestionNotebookButton.styled";

export default function QuestionNotebookButton({
  className,
  question,
  isShowingNotebook,
  setQueryBuilderMode,
  ...props
}) {
  return (
    <Tooltip
      tooltip={isShowingNotebook ? t`Hide editor` : t`Show editor`}
      placement="bottom"
    >
      <NotebookButton
        borderless={!isShowingNotebook}
        primary={isShowingNotebook}
        medium
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

QuestionNotebookButton.shouldRender = ({ question, isActionListVisible }) =>
  question.isStructured() &&
  question.query().isEditable() &&
  isActionListVisible;
