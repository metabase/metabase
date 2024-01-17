import { t } from "ttag";
import { color } from "metabase/lib/colors";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import type { QueryBuilderMode } from "metabase-types/store";
import type Question from "metabase-lib/Question";
import { HeaderButton } from "./ViewHeader.styled";

interface FilterHeaderButtonProps {
  className?: string;
  onOpenModal: (modalType: string) => void;
}

export function FilterHeaderButton({
  className,
  onOpenModal,
}: FilterHeaderButtonProps) {
  return (
    <HeaderButton
      className={className}
      active={false}
      large
      labelBreakpoint="sm"
      color={color("filter")}
      onClick={() => onOpenModal(MODAL_TYPES.FILTERS)}
      data-metabase-event="View Mode; Open Filter Modal"
      data-testid="question-filter-header"
    >
      {t`Filter`}
    </HeaderButton>
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
}: RenderCheckOpts) =>
  queryBuilderMode === "view" &&
  question.isStructured() &&
  question.isQueryEditable() &&
  !isObjectDetail &&
  isActionListVisible;
