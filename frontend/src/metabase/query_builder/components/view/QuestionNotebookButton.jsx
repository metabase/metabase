/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";
import cx from "classnames";

import { Tooltip } from "metabase/core/components/Tooltip";
import { Button } from "metabase/core/components/Button";

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
      <Button
        borderless={!isShowingNotebook}
        primary={isShowingNotebook}
        medium
        className={cx(className, isShowingNotebook ? undefined : "text-dark", {
          "text-brand-hover": !isShowingNotebook,
        })}
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
