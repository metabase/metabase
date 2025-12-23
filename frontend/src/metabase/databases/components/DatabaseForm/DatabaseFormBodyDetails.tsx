import { useFormikContext } from "formik";

import type {
  DatabaseData,
  DatabaseFieldOrGroup,
  Engine,
  EngineField,
  EngineKey,
} from "metabase-types/api";

import { isDatabaseFieldGroup, shouldShowField } from "../../utils/schema";
import { DatabaseDetailField } from "../DatabaseDetailField";

import { CustomContainer } from "./container-styles";

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
    if (!shouldShowField(engineField, isAdvanced, values.details)) {
      return null;
    }

    return (
      <DatabaseDetailField
        key={engineField.name}
        field={engineField}
        autoFocus={autofocusFieldName === engineField.name}
        data-key={engineField.name}
        engineKey={engineKey}
        engine={engine}
      />
    );
  }

  return fields.map((field) => {
    if (isDatabaseFieldGroup(field)) {
      const key = field.fields.map((field) => field.name).join("-");
      return (
        <CustomContainer key={key} containerStyle={field["container-style"]}>
          {field.fields.map(renderField)}
        </CustomContainer>
      );
    }

    return renderField(field);
  });
}
