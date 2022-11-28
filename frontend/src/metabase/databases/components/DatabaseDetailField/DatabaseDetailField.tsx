import React from "react";
import { EngineField } from "metabase-types/api";
import FormNumericInput from "metabase/core/components/FormNumericInput";
import FormInput from "metabase/core/components/FormInput";
import FormTextArea from "metabase/core/components/FormTextArea";
import FormToggle from "metabase/core/components/FormToggle";
import DatabaseInfoField from "../DatabaseInfoField";
import DatabaseSectionField from "../DatabaseSectionField";
import { FIELD_OVERRIDES } from "../../constants";
import { EngineFieldOverride } from "../../types";

export interface DatabaseDetailFieldProps {
  field: EngineField;
}

const DatabaseDetailField = ({
  field,
}: DatabaseDetailFieldProps): JSX.Element => {
  const override = FIELD_OVERRIDES[field.name];

  if (override?.type) {
    const Field = override.type;
    return <Field {...getFieldProps(field, override)} />;
  }

  switch (field.type) {
    case "text":
      return <FormTextArea {...getFieldProps(field, override)} />;
    case "integer":
      return <FormNumericInput {...getInputProps(field, override)} nullable />;
    case "boolean":
      return <FormToggle {...getFieldProps(field, override)} />;
    case "info":
      return <DatabaseInfoField {...getFieldProps(field, override)} />;
    case "section":
      return <DatabaseSectionField {...getFieldProps(field, override)} />;
    default:
      return <FormInput {...getInputProps(field, override)} nullable />;
  }
};

const getFieldProps = (field: EngineField, override?: EngineFieldOverride) => {
  return {
    name: override?.name ?? `details.${field.name}`,
    title: override?.title ?? field["display-name"],
    description: override?.description ?? field.description,
    placeholder: field.placeholder,
  };
};

const getInputProps = (field: EngineField, override?: EngineFieldOverride) => {
  return {
    ...getFieldProps(field, override),
    infoTooltip: field["helper-text"],
    rightIcon: field["helper-text"] && "info",
    rightIconTooltip: field["helper-text"],
  };
};

export default DatabaseDetailField;
