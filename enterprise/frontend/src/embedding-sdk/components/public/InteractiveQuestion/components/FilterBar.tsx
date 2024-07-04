import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { useDispatch } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import { QuestionFiltersHeader } from "metabase/query_builder/components/view/ViewHeader/components";

export const FilterBar = () => {
  const dispatch = useDispatch();

  const { question } = useInteractiveQuestionContext();

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
      updateQuestion={(...args) => dispatch(updateQuestion(...args))}
    />
  );
};
