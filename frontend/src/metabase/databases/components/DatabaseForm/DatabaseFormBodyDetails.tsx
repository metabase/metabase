import type {
  Engine,
  EngineField,
  EngineFieldGroup,
  EngineFieldOrGroup,
  EngineKey,
} from "metabase-types/api";

import { DatabaseDetailField } from "../DatabaseDetailField";

import { getContainer } from "./container-styles";

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

  return fields.map((field) => {
    if (isEngineFieldGroup(field)) {
      const Container = getContainer(field["container-style"]);
      const key = field.fields.map((field) => field.name).join("-");
      return <Container key={key}>{field.fields.map(renderField)}</Container>;
    }

    return renderField(field);
  });
}
