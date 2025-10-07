import { useMemo } from "react";
import _ from "underscore";

import { Stack, rem } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { FieldItem } from "./FieldItem";
import type { ModelColumnUpdate } from "./types";

interface Props {
  activeFieldName?: string;
  getFieldHref: (fieldName: string) => string;
  table: Table;
  onChangeSettings: (update: ModelColumnUpdate) => Promise<{ error?: string }>;
}

export const ModelColumnsList = ({
  activeFieldName,
  getFieldHref,
  table,
  onChangeSettings,
}: Props) => {
  const fields = useMemo(() => {
    return _.sortBy(table.fields ?? [], (item) => item.position);
  }, [table.fields]);
  const fieldsByName = useMemo(() => {
    return _.indexBy(fields, (field) => field.name);
  }, [fields]);

  return (
    <Stack gap={rem(12)}>
      {fields.map((field) => {
        const name = field.name;
        const parentName = field.nfc_path?.[0] ?? "";
        const parent = fieldsByName[parentName];

        return (
          <FieldItem
            key={name}
            active={name === activeFieldName}
            field={field}
            parent={parent}
            href={getFieldHref(name)}
            onChangeSettings={onChangeSettings}
          />
        );
      })}
    </Stack>
  );
};
