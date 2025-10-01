import type { Engine, EngineField, EngineKey } from "metabase-types/api";

import { DatabaseDetailField } from "../DatabaseDetailField";

import { getContainer } from "./container-styles";
import { GroupedFields, groupFields } from "./field-grouping";

interface DatabaseFormBodyDetailsProps {
  fields: EngineField[] | GroupedFields[];
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
  const fieldGroups = engine?.["extra-info"]?.["field-groups"] ?? [];

  const mappedFields = fieldGroups.reduce<Array<EngineField | GroupedFields>>(
    (acc, fieldGroupConfig) => {
      return groupFields({ fields: acc, fieldGroupConfig });
    },
    fields,
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
    if (field instanceof GroupedFields) {
      const Container = getContainer(field.fieldGroupConfig["container-style"]);
      return (
        <Container key={field.fieldGroupConfig.id}>
          {field.fields.map(renderField)}
        </Container>
      );
    }

    return renderField(field);
  });
}
