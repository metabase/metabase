import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { QuestionFiltersHeader } from "metabase/query_builder/components/view/ViewHeader/components";

export const FilterBar = () => {
  const { question, onQuestionChange } = useInteractiveQuestionContext();

  const shouldRender =
    question &&
    QuestionFiltersHeader.shouldRender({
      question,
      isObjectDetail: false,

      // This only renders when the queryBuilderMode is view.
      queryBuilderMode: "view",
    });

  if (!shouldRender) {
    return null;
  }

  return (
    <QuestionFiltersHeader
      expanded
      question={question}
      updateQuestion={onQuestionChange}
    />
  );
};
