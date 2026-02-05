import { useMemo, useState } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { getColumnIcon } from "metabase/common/utils/columns";
import { Flex, Icon, Popover, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./DimensionPill.module.css";

export interface DimensionPillProps {
  query: Lib.Query;
  stageIndex: number;
  column?: Lib.ColumnMetadata;
  color?: string;
  columnFilter?: (col: Lib.ColumnMetadata) => boolean;
  onColumnChange: (newColumn: Lib.ColumnMetadata) => void;
  disabled?: boolean;
}

export function DimensionPill({
  query,
  stageIndex,
  column,
  color,
  columnFilter,
  onColumnChange,
  disabled,
}: DimensionPillProps) {
  const [isOpen, setIsOpen] = useState(false);

  const columnInfo = column
    ? Lib.displayInfo(query, stageIndex, Lib.withTemporalBucket(column, null))
    : null;
  const iconName = column ? getColumnIcon(column) : "add";

  const { columnGroups, totalColumns } = useMemo(() => {
    const columns = Lib.breakoutableColumns(query, stageIndex);
    const filtered = columns.filter((col) => {
      const info = Lib.displayInfo(query, stageIndex, col);
      if (info.isImplicitlyJoinable) {
        return false;
      }
      return columnFilter ? columnFilter(col) : true;
    });
    return {
      columnGroups: Lib.groupColumns(filtered),
      totalColumns: filtered.length,
    };
  }, [query, stageIndex, columnFilter]);

  const isPlaceholder = !column;
  const isEmpty = isPlaceholder && totalColumns === 0;
  const hasMultipleOptions =
    totalColumns > 1 || (isPlaceholder && totalColumns > 0);

  const handleSelect = (newColumn: Lib.ColumnMetadata) => {
    onColumnChange(newColumn);
    setIsOpen(false);
  };

  const checkIsColumnSelected = ({
    breakoutPositions = [],
  }: Lib.ColumnDisplayInfo) => {
    return breakoutPositions.length > 0;
  };

  let pillLabel: string;
  if (isEmpty) {
    pillLabel = t`No compatible dimensions`;
  } else if (isPlaceholder) {
    pillLabel = t`Select a dimension`;
  } else {
    pillLabel = columnInfo?.displayName ?? "";
  }

  const pillContent = (
    <Flex
      className={S.pill}
      align="center"
      gap="xs"
      onClick={
        hasMultipleOptions && !disabled ? () => setIsOpen(true) : undefined
      }
      data-disabled={disabled || isEmpty}
      data-static={!hasMultipleOptions}
      data-placeholder={isPlaceholder || undefined}
    >
      <Icon
        name={iconName}
        size={14}
        c={color as Parameters<typeof Icon>[0]["c"]}
      />
      <Text size="sm" lh={1} c={isEmpty ? "text-tertiary" : undefined}>
        {pillLabel}
      </Text>
    </Flex>
  );

  if (!hasMultipleOptions) {
    return pillContent;
  }

  return (
    <Popover opened={isOpen} onChange={setIsOpen} position="bottom-start">
      <Popover.Target>{pillContent}</Popover.Target>
      <Popover.Dropdown>
        <QueryColumnPicker
          query={query}
          stageIndex={stageIndex}
          columnGroups={columnGroups}
          checkIsColumnSelected={checkIsColumnSelected}
          onSelect={handleSelect}
          onClose={() => setIsOpen(false)}
          alwaysExpanded
          hideSectionNames
        />
      </Popover.Dropdown>
    </Popover>
  );
}
