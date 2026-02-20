import { useMemo } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { getColumnIcon } from "metabase/common/utils/columns";
import { FixedSizeIcon, Group } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { ReplaceSourceColumnInfo } from "metabase-types/api";

type ColumnInfoCellProps = {
  column: ReplaceSourceColumnInfo;
};

export function ColumnInfoCell({ column }: ColumnInfoCellProps) {
  const icon = useMemo(() => {
    return getColumnIcon(Lib.legacyColumnTypeInfo(column));
  }, [column]);

  return (
    <Group gap="sm" wrap="nowrap">
      <FixedSizeIcon name={icon} />
      <Ellipsified>{column.display_name}</Ellipsified>
    </Group>
  );
}
