import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { QuestionNotebookButton } from "metabase/query_builder/components/view/ViewHeader/components";

export const NotebookButton = () => {
  const { question, isNotebookOpen, setIsNotebookOpen } =
    useInteractiveQuestionContext();
  return (
    question &&
    QuestionNotebookButton.shouldRender({
      question,
      isActionListVisible: false,
    }) && (
      <QuestionNotebookButton
        isShowingNotebook={isNotebookOpen}
        setQueryBuilderMode={() => {
          setIsNotebookOpen(!isNotebookOpen);
        }}
      />
    )
  );
};
