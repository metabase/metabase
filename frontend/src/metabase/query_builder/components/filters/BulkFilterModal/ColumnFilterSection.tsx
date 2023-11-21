import { Flex, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
import { BooleanFilterEditor } from "./BooleanFilterEditor";
import { NumberFilterEditor } from "./NumberFilterEditor";

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
  const FilterWidget = getFilterWidget(column);
  return (
    <FilterWidget
      query={query}
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      onChange={onChange}
    />
  );
}

function NotImplementedWidget({
  query,
  stageIndex,
  column,
}: Pick<ColumnFilterSectionProps, "query" | "stageIndex" | "column">) {
  const columnInfo = Lib.displayInfo(query, stageIndex, column);
  const columnIcon = getColumnIcon(column);

  return (
    <Flex direction="row" align="center" gap="sm" py="1rem">
      <Icon name={columnIcon} />
      <Text color="text.2" weight="bold">
        {columnInfo.displayName}
      </Text>
    </Flex>
  );
}

function getFilterWidget(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return BooleanFilterEditor;
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
    return NumberFilterEditor;
  }
  return NotImplementedWidget;
}
