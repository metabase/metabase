import { QuestionNotebookButton } from "metabase/query_builder/components/view/ViewHeader/components";

import { useInteractiveQuestionData } from "../hooks";

export const NotebookButton = ({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) => {
  const { question } = useInteractiveQuestionData();
  return (
    question &&
    QuestionNotebookButton.shouldRender({
      question,
      isActionListVisible: true,
    }) && (
      <QuestionNotebookButton
        isShowingNotebook={isOpen}
        setQueryBuilderMode={onClick}
      />
    )
  );
};
