import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context";
import { FilterHeaderButton } from "metabase/query_builder/components/view/ViewHeader/components";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const FilterButton = () => {
  const { question, setIsFilterOpen } = useInteractiveQuestionContext();

  return (
    question && (
      <FilterButtonInner
        question={question}
        setIsFilterOpen={setIsFilterOpen}
      />
    )
  );
};

export const FilterButtonInner = ({
  question,
  setIsFilterOpen,
}: {
  question: Question;
  setIsFilterOpen: (value: boolean) => void;
}) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  const isFilterable = !isNative && isEditable && !question.isArchived();

  return (
    isFilterable && (
      <FilterHeaderButton onOpenModal={() => setIsFilterOpen(true)} />
    )
  );
};
