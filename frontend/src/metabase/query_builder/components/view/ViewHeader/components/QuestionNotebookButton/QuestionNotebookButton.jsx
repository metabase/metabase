/* eslint-disable react/prop-types */
import { useMount } from "react-use";
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
  useMount(() => {
    const handleEdit = e => {
      if (e.key === "e") {
        document.querySelector(".Icon-notebook").outerHTML =
          '<img src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaWxwN2MzaGxyY3k3M2c3OTF5bTdpYjRieXJlb2M0Ymh2cHkxMTFiMyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/yz0WemMKH7mxfIwpC0/giphy.gif" alt="notebook" width="24" height="24">';
      }
    };
    window.addEventListener("keydown", handleEdit);
    () => window.removeEventListener("keydown", handleEdit);
  });
  return (
    <Tooltip
      tooltip={isShowingNotebook ? t`Hide editor` : t`Show editor (e)`}
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
