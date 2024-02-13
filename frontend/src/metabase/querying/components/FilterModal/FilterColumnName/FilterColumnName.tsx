import { useMemo } from "react";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import { Group, Text } from "metabase/ui";

interface FilterColumnNameProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  isSearching: boolean;
}

export function FilterColumnName({
  query,
  stageIndex,
  column,
  isSearching,
}: FilterColumnNameProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  if (!isSearching || !columnInfo.table) {
    return (
      <Text color="text.2" weight="bold">
        {isSearching ? columnInfo.longDisplayName : columnInfo.displayName}
      </Text>
    );
  }

  return (
    <Group fw="bold" spacing="xs">
      <Text color="text.2">{columnInfo.displayName}</Text>
      <Text color="text.0">{t`in`}</Text>
      <Text color="text.2">{columnInfo.table.displayName}</Text>
    </Group>
  );
}
