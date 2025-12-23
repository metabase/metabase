import { useFormikContext } from "formik";

import type {
  DatabaseData,
  DatabaseFieldOrGroup,
  Engine,
  EngineField,
  EngineKey,
} from "metabase-types/api";

import {
  isDatabaseFieldGroup,
  isFieldVisibleAndDefined,
} from "../../utils/schema";
import { DatabaseDetailField } from "../DatabaseDetailField";

import { getContainer } from "./container-styles";

interface DatabaseFormBodyDetailsProps {
  fields: DatabaseFieldOrGroup[];
  autofocusFieldName?: string;
  engineKey: EngineKey | undefined;
  engine: Engine | undefined;
  isAdvanced: boolean;
}

export function DatabaseFormBodyDetails({
  fields,
  autofocusFieldName,
  engineKey,
  engine,
  isAdvanced,
}: DatabaseFormBodyDetailsProps) {
  const { values } = useFormikContext<DatabaseData>();
  function renderField(engineField: EngineField) {
    if (!isFieldVisibleAndDefined(engineField, isAdvanced, values.details)) {
      return null;
    }

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
    if (isDatabaseFieldGroup(field)) {
      const Container = getContainer(field["container-style"]);
      const key = field.fields.map((field) => field.name).join("-");
      return <Container key={key}>{field.fields.map(renderField)}</Container>;
    }

    return renderField(field);
  });
}
