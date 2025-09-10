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

interface FieldMapper {
  fieldRegexes: RegExp[];
  className: string;
  key: string;
  skipEngine?: string[];
  visibleIf?: Record<string, boolean>[];
}

const mappers: FieldMapper[] = [
  {
    fieldRegexes: [/^host$/, /^port$/],
    // BigQuery Cloud SDK and Snowflake have just host field
    skipEngine: ["bigquery-cloud-sdk", "snowflake"],
    className: S.SubGroup,
    key: "host-and-port",
  },
  {
    // SSL and SSH-tunnel toggles that expand related fields
    fieldRegexes: [/^ssl$/, /^tunnel-enabled$/],
    // related fields to SSL and Tunnel
    visibleIf: [
      {
        ssl: true,
      },
      {
        "tunnel-enabled": true,
      },
    ],
    className: S.FormField,
    key: "ssl-and-tunnel",
  },
  {
    fieldRegexes: [/^auth-enabled$/],
    visibleIf: [
      {
        "auth-enabled": true,
      },
    ],
    className: S.FormField,
    key: "auth-and-ssl",
  },
  {
    fieldRegexes: [/^kerberos$/],
    className: S.FormField,
    key: "kerberos",
    visibleIf: [
      {
        kerberos: true,
      },
    ],
  },
  {
    fieldRegexes: [/^let-user-control-scheduling$/],
    visibleIf: [
      {
        "let-user-control-scheduling": true,
      },
    ],
    className: S.FormField,
    key: "let-user-control-scheduling",
  },
];

export function DatabaseFormBodyDetails({
  fields,
  autofocusFieldName,
  engineKey,
  engine,
}: DatabaseFormBodyDetailsProps) {
  const fieldMappers: FieldMapper[] = [
    ...mappers,
    ...fields
      .filter((field) => field?.["visible-if"]?.["advanced-options"])
      .map((field) => ({
        fieldRegexes: [new RegExp(`^${field.name}$`)],
        className: S.FormField,
        key: field.name,
      })),
  ];

  const mappedFields = fieldMappers.reduce<Array<EngineField | GroupField>>(
    (acc, mapper) => {
      if (engineKey && mapper?.skipEngine?.includes(engineKey)) {
        return acc;
      }

      return groupFields(acc, mapper);
    },
    fields,
  );

  const formFields = mappedFields.map((field) => {
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

function groupFields(
  fields: Array<EngineField | GroupField>,
  {
    fieldRegexes,
    visibleIf,
    className,
    key,
  }: {
    fieldRegexes: Array<RegExp>;
    visibleIf?: Record<string, boolean>[];
    className: string;
    key: string;
  },
): Array<EngineField | GroupField> {
  if (fields.length === 0) {
    return fields;
  }

  // Indexes of the fields to combine into one group field
  const indexes = fields
    .filter((field) => {
      if (field instanceof GroupField) {
        return false;
      }

      let result = false;

      if (fieldRegexes) {
        result = result || fieldRegexes.some((regex) => regex.test(field.name));
      }

      if (visibleIf) {
        const res = visibleIf.some((rule) =>
          Object.entries(rule).every(
            ([key, value]) => field?.["visible-if"]?.[key] === value,
          ),
        );
        result = result || res;
      }

      return result;
    })
    .map((field) => (field ? fields.indexOf(field) : -1))
    .filter((index) => index !== -1);

  // // If we haven't found all the fields, return the original fields
  if (indexes.length === 0) {
    return fields;
  }

  // Combine the fields into a group field
  const combinedField = new GroupField(
    indexes.map((index) => fields[index] as EngineField),
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
