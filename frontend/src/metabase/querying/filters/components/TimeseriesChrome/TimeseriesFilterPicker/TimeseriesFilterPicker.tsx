import { useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { SimpleDateFilterPicker } from "metabase/querying/filters/components/FilterPicker/DateFilterPicker";
import { Box, Button, Icon, Popover } from "metabase/ui";
import {
  PopoverSideFallbackProvider,
  usePopoverSideFallbackMiddlewares,
} from "metabase/ui/components/utils/PopoverSideFallback";
import S from "metabase/ui/components/utils/PopoverSideFallback/PopoverSideFallback.module.css";
import * as Lib from "metabase-lib";

export interface TimeseriesFilterPickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (newFilter: Lib.ExpressionClause | undefined) => void;
}

export function TimeseriesFilterPicker(props: TimeseriesFilterPickerProps) {
  return (
    <PopoverSideFallbackProvider>
      <TimeseriesFilterPickerInner {...props} />
    </PopoverSideFallbackProvider>
  );
}

function TimeseriesFilterPickerInner({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: TimeseriesFilterPickerProps) {
  const [isOpened, setIsOpened] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const middlewares = usePopoverSideFallbackMiddlewares(dropdownRef);

  const filterName = useMemo(() => {
    return filter
      ? Lib.filterArgsDisplayName(query, stageIndex, filter)
      : t`All time`;
  }, [query, stageIndex, filter]);

  const handleButtonClick = () => {
    setIsOpened(!isOpened);
  };

  const handleFilterChange = (newFilter: Lib.ExpressionClause | undefined) => {
    onChange(newFilter);
    setIsOpened(false);
  };

  return (
    <Popover
      opened={isOpened}
      onChange={setIsOpened}
      middlewares={middlewares}
      classNames={{ dropdown: S.dropdown }}
    >
      <Popover.Target>
        <Button
          rightSection={<Icon name="chevrondown" />}
          data-testid="timeseries-filter-button"
          onClick={handleButtonClick}
        >
          {filterName}
        </Button>
      </Popover.Target>
      <Popover.Dropdown
        ref={dropdownRef}
        data-testid="timeseries-filter-popover"
      >
        <Box className={S.dropdownContent}>
          <SimpleDateFilterPicker
            query={query}
            stageIndex={stageIndex}
            column={column}
            filter={filter}
            onChange={handleFilterChange}
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}
