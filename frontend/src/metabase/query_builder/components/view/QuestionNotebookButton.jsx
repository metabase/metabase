import React from "react";

import { t } from "ttag";
import cx from "classnames";

import Tooltip from "metabase/components/Tooltip";
import Button from "metabase/components/Button";

export default function QuestionNotebookButton({
  className,
  question,
  isShowingNotebook,
  setQueryBuilderMode,
  ...props
}) {
  return QuestionNotebookButton.shouldRender({ question }) ? (
    <Tooltip tooltip={isShowingNotebook ? t`Hide editor` : t`Show editor`}>
      <Button
        borderless={!isShowingNotebook}
        primary={isShowingNotebook}
        medium
        className={cx(className, {
          "text-brand-hover": !isShowingNotebook,
        })}
        icon="notebook"
        onClick={() =>
          setQueryBuilderMode(isShowingNotebook ? "view" : "notebook")
        }
        {...props}
      />
    </Tooltip>
  ) : null;
}

QuestionNotebookButton.shouldRender = ({ question }) =>
  question.isStructured() && question.query().isEditable();
