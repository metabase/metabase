import { Fragment } from "react";

import { Box } from "metabase/ui";
import type { Engine, EngineField, EngineKey } from "metabase-types/api";

import DatabaseDetailField from "../DatabaseDetailField";

import S from "./DatabaseForm.module.css";

interface DatabaseFormBodyDetailsProps {
  fields: EngineField[];
  autofocusFieldName?: string;
  engineKey: EngineKey | undefined;
  engine: Engine | undefined;
}

export function DatabaseFormBodyDetails({
  fields,
  autofocusFieldName,
  engineKey,
  engine,
}: DatabaseFormBodyDetailsProps) {
  const groupedFields = groupFields({
    fields,
    fieldNames: ["host", "port"],
    className: S.SubGroup,
    key: "host-and-port",
  });
  const formFields = groupedFields.map((field) => {
    const isGroup = field instanceof GroupField;
    const formRow = (isGroup ? field.fields : [field]).map((f) => (
      <DatabaseDetailField
        key={f.name}
        field={f}
        autoFocus={autofocusFieldName === f.name}
        engineKey={engineKey}
        engine={engine}
      />
    ));

    const Container = isGroup ? Box : Fragment;
    const key = isGroup ? field.key : field.name;
    const props = isGroup
      ? { className: field.className, "data-testid": field.key }
      : {};

    return (
      <Container key={key} {...props}>
        {formRow}
      </Container>
    );
  });

  return formFields;
}

class GroupField {
  constructor(
    public fields: EngineField[],
    public className: string,
    public key: string,
  ) {}
}

function groupFields({
  fields,
  fieldNames,
  className,
  key,
}: {
  fields: EngineField[];
  fieldNames: string[];
  className: string;
  key: string;
}): Array<EngineField | GroupField> {
  if (fields.length === 0) {
    return fields;
  }

  // Indexes of the fields to combine into one group field
  const indexes = fieldNames
    .map((name) => fields.findIndex((field) => field.name === name))
    .filter((index) => index !== -1);

  // If we haven't found all the fields, return the original fields
  if (indexes.length !== fieldNames.length) {
    return fields;
  }

  // Combine the fields into a group field
  const combinedField = new GroupField(
    indexes.map((index) => fields[index]),
    className,
    key,
  );

  // Remove the fields that were combined into a group field
  const filteredFields: Array<EngineField | GroupField> = fields.filter(
    (_field, index) => !indexes.includes(index),
  );

  // Insert the group field at the position of the first field from the group
  return [...filteredFields].toSpliced(indexes[0], 0, combinedField);
}
