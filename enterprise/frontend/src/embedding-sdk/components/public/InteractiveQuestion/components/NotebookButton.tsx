import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context/context";
import { QuestionNotebookButton } from "metabase/query_builder/components/view/ViewHeader/components";

export const NotebookButton = () => {
  const { question, isNotebookOpen, setIsNotebookOpen } =
    useInteractiveQuestionContext();
  return (
    question &&
    QuestionNotebookButton.shouldRender({
      question,
      isActionListVisible: true,
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
