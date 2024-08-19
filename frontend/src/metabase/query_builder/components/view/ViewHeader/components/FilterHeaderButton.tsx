import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { getFilterItems } from "metabase/querying/components/FilterPanel/utils";
import { Box, Button } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderMode } from "metabase-types/store";

import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

interface FilterHeaderButtonProps {
  className?: string;
  onOpenModal: (modalType: QueryModalType) => void;
  query?: Lib.Query;
  isExpanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}

export function FilterHeaderButton({
  className,
  onOpenModal,
  query,
  isExpanded,
  onExpand,
  onCollapse,
}: FilterHeaderButtonProps) {
  const label = isExpanded ? t`Hide filters` : t`Show filters`;
  const items = useMemo(() => query && getFilterItems(query), [query]);

  const shouldShowFilterPanelExpander = Boolean(
    items?.length && onExpand && onCollapse,
  );

  return (
    <Button.Group>
      <Button
        color="filter"
        className={cx(className, ViewTitleHeaderS.FilterButton)}
        onClick={() => onOpenModal(MODAL_TYPES.FILTERS)}
        data-testid="question-filter-header"
      >
        {t`Filter`}
      </Button>
      {shouldShowFilterPanelExpander && (
        <Button
          color="filter"
          aria-label={label}
          className={cx(className, ViewTitleHeaderS.FilterButton)}
          onClick={isExpanded ? onCollapse : onExpand}
          data-testid="filters-visibility-control"
        >
          <Box
            bg="filter"
            px="sm"
            color="white"
            className={ViewTitleHeaderS.FilterCountChip}
          >
            {items?.length}
          </Box>
        </Button>
      )}
    </Button.Group>
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
