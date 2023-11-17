import { Flex, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";

interface ColumnFilterSectionProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
}

export function ColumnFilterSection({
  query,
  stageIndex,
  column,
}: ColumnFilterSectionProps) {
  const columnInfo = Lib.displayInfo(query, stageIndex, column);
  const columnIcon = getColumnIcon(column);

  return (
    <Flex direction="row" align="center" px="2rem" py="1rem" gap="sm">
      <Icon name={columnIcon} />
      <Text color="text.2" weight="bold">
        {columnInfo.displayName}
      </Text>
    </Flex>
  );
}
