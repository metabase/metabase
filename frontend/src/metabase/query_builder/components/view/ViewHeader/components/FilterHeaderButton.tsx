import cx from "classnames";
import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
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

  dirtyAddedFilters: Filter[];
  dirtyRemovedFilters: Filter[];
  setDirtyAddedFilters: Dispatch<SetStateAction<Filter[]>>;
  setDirtyRemovedFilters: Dispatch<SetStateAction<Filter[]>>;
}

type Filter = Lib.Clause | Lib.SegmentMetadata;

export function FilterHeaderButton({
  className,
  // onOpenModal,
  query,
  isExpanded,
  onExpand,
  onCollapse,

  dirtyAddedFilters,
  dirtyRemovedFilters,
  setDirtyAddedFilters,
  // setDirtyRemovedFilters,
}: FilterHeaderButtonProps) {
  const label = isExpanded ? t`Hide filters` : t`Show filters`;
  const items = useMemo(() => {
    const items = getFilterItems(query).filter(({ filter }) => {
      return !dirtyRemovedFilters.includes(filter);
    });

    const dirtyAddedFilterItems = dirtyAddedFilters.map(filter => ({
      filter,
      stageIndex: -1,
    }));

    return [...items, ...dirtyAddedFilterItems];
  }, [query, dirtyRemovedFilters, dirtyAddedFilters]);
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
      setIsDropdownOpen(isOpen => !isOpen);

      dirtyRemovedFilters;
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
