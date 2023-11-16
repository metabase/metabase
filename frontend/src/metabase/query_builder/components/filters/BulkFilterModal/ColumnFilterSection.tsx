import { Flex, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
import type { FilterPickerWidgetProps } from "./types";

interface ColumnFilterSectionProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (filter?: Lib.ExpressionClause) => void;
}

export function ColumnFilterSection({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: ColumnFilterSectionProps) {
  const columnInfo = Lib.displayInfo(query, stageIndex, column);
  const columnIcon = getColumnIcon(column);

  const FilterWidget = getFilterWidget(column);

  return (
    <Flex direction="row" align="center" px="2rem" py="1rem" gap="sm">
      <Icon name={columnIcon} />
      <Text color="text.2" weight="bold">
        {columnInfo.displayName}
      </Text>
      <FilterWidget
        query={query}
        stageIndex={stageIndex}
        column={column}
        filter={filter}
        onChange={onChange}
      />
    </Flex>
  );
}

function NotImplementedWidget(props: FilterPickerWidgetProps) {
  return null;
}

function getFilterWidget(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return NotImplementedWidget;
  }
  if (Lib.isTime(column)) {
    return NotImplementedWidget;
  }
  if (Lib.isDate(column)) {
    return NotImplementedWidget;
  }
  if (Lib.isCoordinate(column)) {
    return NotImplementedWidget;
  }
  if (Lib.isString(column)) {
    return NotImplementedWidget;
  }
  if (Lib.isNumeric(column)) {
    return NotImplementedWidget;
  }
  return NotImplementedWidget;
}
