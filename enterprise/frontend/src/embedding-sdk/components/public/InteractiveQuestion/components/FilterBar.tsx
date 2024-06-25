import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { useDispatch } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import { QuestionFiltersHeader } from "metabase/query_builder/components/view/ViewHeader/components";

export const FilterBar = () => {
  const dispatch = useDispatch();

  const { question, uiControls } = useInteractiveQuestionContext();

  return (
    QuestionFiltersHeader.shouldRender({
      question,
      queryBuilderMode: uiControls.queryBuilderMode,
      isObjectDetail: false,
    }) && (
      <QuestionFiltersHeader
        expanded
        question={question}
        updateQuestion={(...args) => dispatch(updateQuestion(...args))}
      />
    )
  );
};
