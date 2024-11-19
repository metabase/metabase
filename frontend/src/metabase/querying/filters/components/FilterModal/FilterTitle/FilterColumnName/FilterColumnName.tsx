import { useMemo } from "react";
import { t } from "ttag";

import { Group, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

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
      <Text color="text-dark" weight="bold">
        {isSearching ? columnInfo.longDisplayName : columnInfo.displayName}
      </Text>
    );
  }

  return (
    <Group fw="bold" spacing="xs">
      <Text color="text-dark">{columnInfo.displayName}</Text>
      <Text color="text-light">{t`in`}</Text>
      <Text color="text-dark">{columnInfo.table.displayName}</Text>
    </Group>
  );
}
