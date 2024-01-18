import { useMemo } from "react";
import { getColumnIcon } from "metabase/common/utils/columns";
import { Flex, Text, Icon } from "metabase/ui";

import * as Lib from "metabase-lib";
import type { FilterEditorProps } from "../types";

export function EmptyFilterEditor({
  query,
  stageIndex,
  column,
}: FilterEditorProps) {
  const columnInfo = useMemo(() => {
    return Lib.displayInfo(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const columnIcon = useMemo(() => {
    return getColumnIcon(column);
  }, [column]);

  return (
    <Flex direction="row" align="center" gap="sm" py="1rem">
      <Icon name={columnIcon} />
      <Text color="text-dark" weight="bold">
        {columnInfo.displayName}
      </Text>
    </Flex>
  );
}
