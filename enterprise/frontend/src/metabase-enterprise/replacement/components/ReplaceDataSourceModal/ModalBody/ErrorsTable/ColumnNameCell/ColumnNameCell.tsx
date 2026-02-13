import { Ellipsified } from "metabase/common/components/Ellipsified";
import { getColumnIcon } from "metabase/common/utils/columns";
import { FixedSizeIcon, Group } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { ReplaceSourceColumnInfo } from "metabase-types/api";

type ColumnNameCellProps = {
  column: ReplaceSourceColumnInfo;
};

export function ColumnNameCell({ column }: ColumnNameCellProps) {
  const columnInfo = Lib.legacyColumnTypeInfo(column);

  return (
    <Group gap="sm" wrap="nowrap">
      <FixedSizeIcon name={getColumnIcon(columnInfo)} />
      <Ellipsified>{column.display_name}</Ellipsified>
    </Group>
  );
}
