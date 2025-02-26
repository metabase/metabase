import { useMemo } from "react";
import { t } from "ttag";

import { Group, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { useFilterModalContext } from "../../context";

interface FilterColumnNameProps {
  stageIndex: number;
  column: Lib.ColumnMetadata;
}

export function FilterColumnName({
  stageIndex,
  column,
}: FilterColumnNameProps) {
  const { isSearching, query } = useFilterModalContext();
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  if (!isSearching || !columnInfo.table) {
    return (
      <Text color="text-dark" fw="bold">
        {isSearching ? columnInfo.longDisplayName : columnInfo.displayName}
      </Text>
    );
  }

  return (
    <Group fw="bold" gap="xs">
      <Text color="text-dark">{columnInfo.displayName}</Text>
      <Text color="text-light">{t`in`}</Text>
      <Text color="text-dark">{columnInfo.table.displayName}</Text>
    </Group>
  );
}
