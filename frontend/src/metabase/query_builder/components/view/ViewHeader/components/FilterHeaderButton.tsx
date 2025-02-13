import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderMode } from "metabase-types/store";
import type { QueryModalType } from "metabase/query_builder/constants";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { Button, Icon, Popover } from "metabase/ui";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

interface FilterHeaderButtonProps {
  className?: string;
  onOpenModal: (modalType: QueryModalType) => void;
  query: Lib.Query;
  isExpanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}

export function FilterHeaderButton({
  className,
  // onOpenModal,
  query,
  isExpanded,
  onExpand,
  onCollapse,
}: FilterHeaderButtonProps) {
  const label = isExpanded ? t`Hide filters` : t`Show filters`;
  const items = useMemo(() => query && getFilterItems(query), [query]);
  const hasItems = items ? items.length > 0 : false;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const shouldShowFilterPanelExpander = Boolean(
    hasItems && onExpand && onCollapse,
  );

  const handleFilterClick = () => {
    if (hasItems) {
      if (isExpanded) {
        onCollapse?.();
      } else {
        onExpand?.();
      }
    } else {
      setIsDropdownOpen(true);
    }
  };

  const handleAddFilter = (filter: Lib.Clause | Lib.SegmentMetadata) => {
    // TODO
  };

  return (
    <Button.Group>
      <Popover
        opened={isDropdownOpen}
        position="bottom-start"
        transitionProps={{ duration: 0 }}
        onChange={setIsDropdownOpen}
      >
        <Popover.Target>
          <Button
            leftSection={<Icon name="filter" />}
            className={cx(className, ViewTitleHeaderS.FilterButton)}
            onClick={handleFilterClick}
            data-testid="question-filter-header"
          >
            {t`Filter`}
          </Button>
        </Popover.Target>
        <Popover.Dropdown data-testid="filter-picker-dropdown">
          <FilterPicker
            query={query}
            stageIndex={-1} // TODO
            onSelect={handleAddFilter}
          />
        </Popover.Dropdown>
      </Popover>

      {shouldShowFilterPanelExpander && (
        <Button
          aria-label={label}
          className={ViewTitleHeaderS.FilterButtonAttachment}
          onClick={isExpanded ? onCollapse : onExpand}
          data-testid="filters-visibility-control"
          data-expanded={isExpanded}
          style={{ borderLeft: "none" }} // mantine puts a double border between buttons in groups
        >
          <div className={ViewTitleHeaderS.FilterCountChip}>
            {items?.length}
          </div>
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
