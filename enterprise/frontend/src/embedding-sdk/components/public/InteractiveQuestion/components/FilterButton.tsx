import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { FilterHeaderButton } from "metabase/query_builder/components/view/ViewHeader/components";
import * as Lib from "metabase-lib";

export const FilterButton = () => {
  const { question, setIsFilterOpen } = useInteractiveQuestionContext();

  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  const isFilterable = !isNative && isEditable && !question.isArchived();

  return (
    isFilterable && (
      <FilterHeaderButton onOpenModal={() => setIsFilterOpen(true)} />
    )
  );
};
