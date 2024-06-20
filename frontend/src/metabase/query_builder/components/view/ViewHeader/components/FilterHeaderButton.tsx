import { t } from "ttag";

import { color } from "metabase/lib/colors";
import type { QBModalTypeKey } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderMode } from "metabase-types/store";

import { HeaderButton } from "../ViewTitleHeader.styled";

interface FilterHeaderButtonProps {
  className?: string;
  onOpenModal: (modalType: QBModalTypeKey) => void;
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
