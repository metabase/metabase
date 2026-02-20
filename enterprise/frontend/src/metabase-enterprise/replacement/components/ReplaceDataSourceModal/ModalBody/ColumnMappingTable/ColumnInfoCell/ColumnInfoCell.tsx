import { useMemo } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { getColumnIcon } from "metabase/common/utils/columns";
import { FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  ReplaceSourceColumnInfo,
  ReplaceSourceErrorType,
} from "metabase-types/api";

import { getErrorLabel } from "../../../../../utils";

type ColumnInfoCellProps = {
  column: ReplaceSourceColumnInfo;
  errors?: ReplaceSourceErrorType[];
};

export function ColumnInfoCell({ column, errors }: ColumnInfoCellProps) {
  return (
    <Group gap="sm" wrap="nowrap">
      <ColumnSection column={column} />
      {errors != null && errors.length > 0 && <ErrorsSection errors={errors} />}
    </Group>
  );
}

type ColumnSectionProps = {
  column: ReplaceSourceColumnInfo;
};

function ColumnSection({ column }: ColumnSectionProps) {
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
type ErrorsSectionProps = {
  errors: ReplaceSourceErrorType[];
};

function ErrorsSection({ errors }: ErrorsSectionProps) {
  const label = errors.map(getErrorLabel).join(" ");

  return (
    <Tooltip label={label}>
      <FixedSizeIcon name="warning" />
    </Tooltip>
  );
}
