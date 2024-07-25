import { t } from "ttag";

import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderMode } from "metabase-types/store";

import { FilterButton } from "../ViewTitleHeader.styled";

interface FilterHeaderButtonProps {
  className?: string;
  onOpenModal: (modalType: QueryModalType) => void;
}

export function FilterHeaderButton({
  className,
  onOpenModal,
}: FilterHeaderButtonProps) {
  return (
    <FilterButton
      color="filter"
      className={className}
      onClick={() => onOpenModal(MODAL_TYPES.FILTERS)}
      data-testid="question-filter-header"
    >
      {t`Filter`}
    </FilterButton>
  );
}

interface RenderCheckOpts {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
  isObjectDetail: boolean;
  isActionListVisible: boolean;
}

FilterHeaderButton.shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
  isActionListVisible,
}: RenderCheckOpts) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    queryBuilderMode === "view" &&
    !isNative &&
    isEditable &&
    !isObjectDetail &&
    isActionListVisible &&
    !question.isArchived()
  );
};
