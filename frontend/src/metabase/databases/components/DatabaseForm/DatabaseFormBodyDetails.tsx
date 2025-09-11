import { Fragment } from "react";

import { Box } from "metabase/ui";
import type { Engine, EngineField, EngineKey } from "metabase-types/api";

import DatabaseDetailField from "../DatabaseDetailField";

import S from "./DatabaseForm.module.css";
import {
  FieldRegexRule,
  GroupField,
  VisibleIfRule,
  groupFieldsByRules,
} from "./database-field-grouping";

interface DatabaseFormBodyDetailsProps {
  fields: EngineField[];
  autofocusFieldName?: string;
  engineKey: EngineKey | undefined;
  engine: Engine | undefined;
}

export interface FieldMapper {
  rules: Array<VisibleIfRule | FieldRegexRule>;
  fieldRegexes?: RegExp[];
  className: string;
  key: string;
  skipEngine?: string[];
  visibleIf?: Record<string, boolean>[];
}

const mappers: FieldMapper[] = [
  {
    rules: [new FieldRegexRule(/^host$/), new FieldRegexRule(/^port$/)],
    // BigQuery Cloud SDK and Snowflake have just host field
    skipEngine: ["bigquery-cloud-sdk", "snowflake"],
    className: S.SubGroup,
    key: "host-and-port",
  },
  {
    // SSL and SSH-tunnel toggles that expand related fields
    rules: [
      new FieldRegexRule(/^ssl$/),
      new FieldRegexRule(/^tunnel-enabled$/),
      new VisibleIfRule({ ssl: true }),
      new VisibleIfRule({ "tunnel-enabled": true }),
    ],
    className: S.FormField,
    key: "ssl-and-tunnel",
  },
  {
    rules: [
      new FieldRegexRule(/^auth-enabled$/),
      new VisibleIfRule({ "auth-enabled": true }),
    ],
    className: S.FormField,
    key: "auth-and-ssl",
  },
  {
    rules: [
      new FieldRegexRule(/^kerberos$/),
      new VisibleIfRule({ kerberos: true }),
    ],
    className: S.FormField,
    key: "kerberos",
  },
  {
    rules: [
      new FieldRegexRule(/^let-user-control-scheduling$/),
      new VisibleIfRule({ "let-user-control-scheduling": true }),
    ],
    className: S.FormField,
    key: "let-user-control-scheduling",
  },
];

function mapAdvancedOptionsToSections(fields: EngineField[]): FieldMapper[] {
  return fields
    .filter((field) => field?.["visible-if"]?.["advanced-options"])
    .map((field) => ({
      rules: [new FieldRegexRule(new RegExp(`^${field.name}$`))],
      className: S.FormField,
      key: field.name,
    }));
}

export function DatabaseFormBodyDetails({
  fields,
  autofocusFieldName,
  engineKey,
  engine,
}: DatabaseFormBodyDetailsProps) {
  const fieldMappers: FieldMapper[] = [
    ...mappers,
    ...mapAdvancedOptionsToSections(fields),
  ];

  const mappedFields = fieldMappers.reduce<Array<EngineField | GroupField>>(
    (acc, mapper) => {
      if (engineKey && mapper?.skipEngine?.includes(engineKey)) {
        return acc;
      }

      return groupFieldsByRules(acc, mapper);
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
