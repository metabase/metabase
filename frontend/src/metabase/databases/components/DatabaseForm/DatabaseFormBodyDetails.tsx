import type {
  Engine,
  EngineField,
  EngineFieldGroup,
  EngineFieldOrGroup,
  EngineKey,
} from "metabase-types/api";

import { DatabaseDetailField } from "../DatabaseDetailField";

import { getContainer } from "./container-styles";
import { GroupedFields, groupFields } from "./field-grouping";

interface DatabaseFormBodyDetailsProps {
  fields: EngineFieldOrGroup[];
  autofocusFieldName?: string;
  engineKey: EngineKey | undefined;
  engine: Engine | undefined;
}

function isEngineFieldGroup(
  field: EngineFieldOrGroup,
): field is EngineFieldGroup {
  return (
    typeof field === "object" &&
    field !== null &&
    "type" in field &&
    field.type === "group"
  );
}

export function DatabaseFormBodyDetails({
  fields,
  autofocusFieldName,
  engineKey,
  engine,
}: DatabaseFormBodyDetailsProps) {
  const fieldGroups = engine?.["extra-info"]?.["field-groups"] ?? [];

  // Check if fields contain nested groups (new format)
  const hasNestedGroups = fields.some(isEngineFieldGroup);

  // If using new nested group format, skip the old grouping logic
  const mappedFields: Array<EngineFieldOrGroup | GroupedFields> =
    hasNestedGroups
      ? fields
      : fieldGroups.reduce<Array<EngineField | GroupedFields>>(
          (acc, fieldGroupConfig) => {
            return groupFields({ fields: acc, fieldGroupConfig });
          },
          fields as EngineField[],
        );

  function renderField(engineField: EngineField) {
    return (
      <DatabaseDetailField
        key={engineField.name}
        field={engineField}
        autoFocus={autofocusFieldName === engineField.name}
        data-kek={engineField.name}
        engineKey={engineKey}
        engine={engine}
      />
    );
  }

  return mappedFields.map((field) => {
    // Handle old GroupedFields format (backwards compatibility) - check first to avoid type issues
    if (field instanceof GroupedFields) {
      const Container = getContainer(field.fieldGroupConfig["container-style"]);
      return (
        <Container key={field.fieldGroupConfig.id}>
          {field.fields.map(renderField)}
        </Container>
      );
    }

    // Handle new nested group format
    if (isEngineFieldGroup(field)) {
      const Container = getContainer(field["container-style"]);
      return (
        <Container key={field.id}>{field.fields.map(renderField)}</Container>
      );
    }

    // Handle regular ungrouped fields
    return renderField(field);
  });
}
