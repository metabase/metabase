import { useMemo, useState } from "react";

import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/i18n/hooks";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { getTranslatedFilterDisplayName } from "metabase/querying/filters/utils/display";
import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterPill } from "../FilterPill";

interface FilterPanelPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  filter: Lib.FilterClause;
  filterIndex: number;
  onChange: (query: Lib.Query) => void;
}

export function FilterPanelPopover({
  query,
  stageIndex,
  filter,
  filterIndex,
  onChange,
}: FilterPanelPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);
  const tc = useTranslateContent();
  const { locale } = useLocale();

  const translatedFilterName = useMemo(
    () => getTranslatedFilterDisplayName(query, stageIndex, filter, tc, locale),
    [query, stageIndex, filter, tc, locale],
  );

  const handleChange = (newFilter: Lib.Clause | Lib.SegmentMetadata) => {
    onChange(Lib.replaceClause(query, stageIndex, filter, newFilter));
    setIsOpened(false);
  };

  const handleRemove = () => {
    onChange(Lib.removeClause(query, stageIndex, filter));
    setIsOpened(false);
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <FilterPill
          onClick={() => setIsOpened((isOpened) => !isOpened)}
          onRemoveClick={handleRemove}
        >
          {translatedFilterName}
        </FilterPill>
      </Popover.Target>
      <Popover.Dropdown data-testid="filter-picker-dropdown">
        <FilterPicker
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={filterIndex}
          onSelect={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
