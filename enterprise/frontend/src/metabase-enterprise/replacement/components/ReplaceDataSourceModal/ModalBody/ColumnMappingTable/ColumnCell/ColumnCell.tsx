import { useMemo } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { getColumnIcon } from "metabase/common/utils/columns";
import { FixedSizeIcon, Group, HoverCard, List } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  ReplaceSourceColumnInfo,
  ReplaceSourceErrorType,
} from "metabase-types/api";

import { getErrorLabel } from "../../../utils";

type ColumnCellProps = {
  column?: ReplaceSourceColumnInfo;
  errors?: ReplaceSourceErrorType[];
};

export function ColumnCell({ column, errors }: ColumnCellProps) {
  return (
    <Group gap="sm" wrap="nowrap">
      {column != null && <ColumnSection column={column} />}
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
  return (
    <HoverCard>
      <HoverCard.Target>
        <FixedSizeIcon name="info" />
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <List spacing="sm">
          {errors.map((error) => (
            <List.Item key={error}>{getErrorLabel(error)}</List.Item>
          ))}
        </List>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
