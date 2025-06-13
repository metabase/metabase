import { useMemo } from "react";
import _ from "underscore";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Stack, rem } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

import { FieldItem } from "./FieldItem";

interface Props {
  activeFieldId?: FieldId;
  getFieldHref: (fieldId: FieldId) => string;
  table: Table;
}

export const FieldList = ({ activeFieldId, getFieldHref, table }: Props) => {
  const fields = useMemo(() => {
    return _.sortBy(table.fields ?? [], (item) => item.position);
  }, [table.fields]);

  return (
    <Stack gap={rem(12)}>
      {fields.map((field) => {
        const id = getRawTableFieldId(field);

        return (
          <FieldItem
            active={id === activeFieldId}
            field={field}
            href={getFieldHref(id)}
            key={id}
          />
        );
      })}
    </Stack>
  );
};
