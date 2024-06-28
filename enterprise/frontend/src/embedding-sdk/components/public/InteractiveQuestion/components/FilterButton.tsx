import { FilterHeaderButton } from "metabase/query_builder/components/view/ViewHeader/components";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionData } from "../hooks";

export const FilterButton = ({ onClick }: { onClick: () => void }) => {
  const { question } = useInteractiveQuestionData();

  return (
    question && <FilterButtonInner question={question} onClick={onClick} />
  );
};

const FilterButtonInner = ({
  question,
  onClick,
}: {
  question: Question;
  onClick: () => void;
}) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  const isFilterable = !isNative && isEditable && !question.isArchived();

  return isFilterable && <FilterHeaderButton onOpenModal={onClick} />;
};
