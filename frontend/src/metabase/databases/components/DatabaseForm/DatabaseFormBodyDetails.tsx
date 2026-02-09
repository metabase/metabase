import { useFormikContext } from "formik";

import type {
  DatabaseData,
  DatabaseFieldGroup,
  DatabaseFieldOrGroup,
  Engine,
  EngineField,
  EngineKey,
} from "metabase-types/api";

import { isDatabaseFieldGroup, shouldShowField } from "../../utils/schema";
import { DatabaseDetailField } from "../DatabaseDetailField";

import type { DatabaseFormConfig } from "./DatabaseForm";
import { CustomContainer } from "./container-styles";

interface DatabaseFormBodyDetailsProps {
  fields: DatabaseFieldOrGroup[];
  autofocusFieldName?: string;
  engineKey: EngineKey | undefined;
  engine: Engine | undefined;
  isAdvanced: boolean;
  config: DatabaseFormConfig;
}

export function DatabaseFormBodyDetails({
  fields,
  autofocusFieldName,
  engineKey,
  engine,
  isAdvanced,
  config,
}: DatabaseFormBodyDetailsProps) {
  const { values } = useFormikContext<DatabaseData>();

  function renderField(engineField: EngineField) {
    if (!shouldShowField(engineField, isAdvanced, config, values.details)) {
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

  function renderGroup(group: DatabaseFieldGroup) {
    const key = group.fields.map((field) => field.name).join("-");
    return (
      <CustomContainer key={key} containerStyle={group["container-style"]}>
        {group.fields.map(renderField)}
      </CustomContainer>
    );
  }

  return fields.map((field) => {
    if (isDatabaseFieldGroup(field)) {
      return renderGroup(field);
    }

    return renderField(field);
  });
}
