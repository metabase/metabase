import { useMemo } from "react";

import { getColumnIcon } from "metabase/common/utils/columns";
import { Ellipsified, FixedSizeIcon, Group } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { SourceReplacementColumnInfo } from "metabase-types/api";

type NameCellProps = {
  column: SourceReplacementColumnInfo;
};

export function NameCell({ column }: NameCellProps) {
  const icon = useMemo(() => {
    return getColumnIcon(Lib.legacyColumnTypeInfo(column));
  }, [column]);

  return (
    <Group gap="sm" wrap="nowrap">
      <FixedSizeIcon name={icon} />
      <Ellipsified>{column.name}</Ellipsified>
    </Group>
  );
}
