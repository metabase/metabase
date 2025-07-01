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

  const fieldsById = useMemo(() => {
    return _.indexBy(fields, (field) => getRawTableFieldId(field));
  }, [fields]);

  return (
    <Stack gap={rem(12)}>
      {fields.map((field) => {
        const id = getRawTableFieldId(field);
        const parent =
          field.parent_id != null ? fieldsById[field.parent_id] : undefined;

        return (
          <FieldItem
            active={id === activeFieldId}
            field={field}
            parent={parent}
            href={getFieldHref(id)}
            key={id}
          />
        );
      })}
    </Stack>
  );
};
