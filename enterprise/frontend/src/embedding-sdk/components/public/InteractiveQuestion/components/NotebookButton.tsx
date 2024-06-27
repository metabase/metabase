import { useInteractiveQuestionData } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { QuestionNotebookButton } from "metabase/query_builder/components/view/ViewHeader/components";

export const NotebookButton = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
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
        setQueryBuilderMode={onClose}
      />
    )
  );
};
