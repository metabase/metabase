import cx from "classnames";
import { t } from "ttag";

import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderMode } from "metabase-types/store";

import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

interface FilterHeaderButtonProps {
  className?: string;
  onOpenModal: (modalType: QueryModalType) => void;
}

export function FilterHeaderButton({
  className,
  onOpenModal,
}: FilterHeaderButtonProps) {
  return (
    <Button
      color="filter"
      className={cx(className, ViewTitleHeaderS.FilterButton)}
      onClick={() => onOpenModal(MODAL_TYPES.FILTERS)}
      data-testid="question-filter-header"
    >
      {t`Filter`}
    </Button>
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
