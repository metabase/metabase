import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import type { QueryModalType } from "metabase/query_builder/constants";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { Badge, Button, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderMode } from "metabase-types/store";

import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

interface FilterHeaderButtonProps {
  className?: string;
  onOpenModal: (modalType: QueryModalType) => void;
  query: Lib.Query;
  isExpanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}

type Filter = Lib.Clause | Lib.SegmentMetadata;

export function FilterHeaderButton({
  className,
  // onOpenModal,
  query,
  isExpanded,
  onExpand,
  onCollapse,
}: FilterHeaderButtonProps) {
  const label = isExpanded ? t`Hide filters` : t`Show filters`;
  const [dirtyAddedFilters, setDirtyAddedFilters] = useState<Filter[]>([]);
  const [dirtyRemovedFilters, setDirtyRemovedFilters] = useState<Filter[]>([]);
  const items = useMemo(() => {
    const items = getFilterItems(query);

    const dirtyAddedFilterItems = dirtyAddedFilters.map(filter => ({
      filter,
      stageIndex: -1,
    }));

    return [...items, ...dirtyAddedFilterItems];
  }, [query, dirtyAddedFilters]);
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

  const handleAddFilter = (filter: Filter) => {
    setDirtyAddedFilters(filters => [...filters, filter]);
    setIsDropdownOpen(false);
    onExpand?.();
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
            aria-label={hasItems ? label : t`Add filter`}
            leftSection={<Icon name="filter" />}
            rightSection={
              shouldShowFilterPanelExpander ? (
                <Badge
                  bg="color-filter"
                  color="text"
                  style={{ cursor: "pointer" }}
                  px="sm"
                >
                  {items.length}
                </Badge>
              ) : null
            }
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
