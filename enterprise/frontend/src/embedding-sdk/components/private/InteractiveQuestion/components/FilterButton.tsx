import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { FilterHeaderButton } from "metabase/query_builder/components/view/ViewHeader/components";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

type FilterButtonProps = { onClick: () => void };

export const FilterButton = ({ onClick }: FilterButtonProps) => {
  const { question } = useInteractiveQuestionContext();

  return (
    question && <FilterButtonInner question={question} onClick={onClick} />
  );
};

const FilterButtonInner = ({
  question,
  onClick,
}: {
  question: Question;
} & FilterButtonProps) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  const isFilterable = !isNative && isEditable && !question.isArchived();

  return isFilterable && <FilterHeaderButton onOpenModal={onClick} />;
};
