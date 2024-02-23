/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";

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
      placement="top"
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
