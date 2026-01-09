import { useMemo } from "react";
import _ from "underscore";

import { Stack, rem } from "metabase/ui";
import type { Field } from "metabase-types/api";

import { FieldItem } from "./FieldItem";

interface Props<T extends number | string> {
  fields: Field[];
  activeFieldKey?: T;
  readOnly?: boolean;
  getFieldKey: (field: Field) => T;
  getFieldHref?: (field: Field) => string;
  onSelect?: (field: Field) => void;
  onNameChange: (field: Field, newName: string) => void;
  onDescriptionChange: (field: Field, newDescription: string | null) => void;
}

export function FieldList<T extends number | string>({
  fields,
  activeFieldKey,
  readOnly,
  getFieldKey,
  getFieldHref,
  onSelect,
  onNameChange,
  onDescriptionChange,
}: Props<T>) {
  const fieldsByName = useMemo(() => {
    return _.indexBy(fields, (field) => field.name);
  }, [fields]);

  return (
    <Stack gap={rem(12)}>
      {fields.map((field) => {
        const key = getFieldKey(field);
        const parentName = field.nfc_path?.[0] ?? "";
        const parent = fieldsByName[parentName];

        return (
          <FieldItem
            key={key}
            field={field}
            active={key === activeFieldKey}
            parent={parent}
            href={getFieldHref?.(field) ?? ""}
            readOnly={readOnly}
            onSelect={() => onSelect?.(field)}
            onNameChange={(newName) => onNameChange(field, newName)}
            onDescriptionChange={(newDescription) =>
              onDescriptionChange(field, newDescription)
            }
          />
        );
      })}
    </Stack>
  );
}
