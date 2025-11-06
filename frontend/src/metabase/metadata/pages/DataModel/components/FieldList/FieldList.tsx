import { useMemo } from "react";
import _ from "underscore";

import { Stack, rem } from "metabase/ui";
import type { Field } from "metabase-types/api";

import { FieldItem } from "./FieldItem";

interface Props {
  fields: Field[];
  activeFieldIndex?: number;
  getFieldHref?: (field: Field) => string;
  onNameChange: (field: Field, newName: string) => void;
  onDescriptionChange: (field: Field, newDescription: string | null) => void;
}

export const FieldList = ({
  fields,
  activeFieldIndex,
  getFieldHref,
  onNameChange,
  onDescriptionChange,
}: Props) => {
  const fieldsByName = useMemo(() => {
    return _.indexBy(fields, (field) => field.name);
  }, [fields]);

  return (
    <Stack gap={rem(12)}>
      {fields.map((field, fieldIndex) => {
        const parentName = field.nfc_path?.[0] ?? "";
        const parent = fieldsByName[parentName];

        return (
          <FieldItem
            key={field.name}
            field={field}
            active={fieldIndex === activeFieldIndex}
            parent={parent}
            href={getFieldHref?.(field) ?? ""}
            onNameChange={(newName) => onNameChange(field, newName)}
            onDescriptionChange={(newDescription) =>
              onDescriptionChange(field, newDescription)
            }
          />
        );
      })}
    </Stack>
  );
};
