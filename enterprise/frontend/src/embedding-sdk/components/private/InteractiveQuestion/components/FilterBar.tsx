import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import {
  FilterPanel,
  shouldRender as shouldRenderFilterPanel,
} from "metabase/querying/filters/components/FilterPanel";

export const FilterBar = () => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  const shouldRender =
    question &&
    shouldRenderFilterPanel({
      question,
      isObjectDetail: false,

      // This only renders when the queryBuilderMode is view.
      queryBuilderMode: "view",
    });

  if (!shouldRender) {
    return null;
  }

  return <FilterPanel question={question} updateQuestion={updateQuestion} />;
};
