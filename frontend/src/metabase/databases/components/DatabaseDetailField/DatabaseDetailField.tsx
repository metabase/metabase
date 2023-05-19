import React from "react";
import { EngineField } from "metabase-types/api";
import FormNumericInput from "metabase/core/components/FormNumericInput";
import FormFileInput from "metabase/core/components/FormFileInput";
import FormInput from "metabase/core/components/FormInput";
import FormSelect from "metabase/core/components/FormSelect";
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
  const type = getFieldType(field, override);
  const props = getFieldProps(field, override);

  if (typeof type === "function") {
    const Component = type;
    return <Component {...props} />;
  }

  switch (type) {
    case "password":
      return <FormInput {...props} {...getPasswordProps(field)} nullable />;
    case "text":
      return <FormTextArea {...props} />;
    case "integer":
      return <FormNumericInput {...props} {...getInputProps(field)} nullable />;
    case "boolean":
      return <FormToggle {...props} />;
    case "select":
      return <FormSelect {...props} {...getSelectProps(field, override)} />;
    case "textFile":
      return <FormFileInput {...props} />;
    case "info":
      return <DatabaseInfoField {...props} />;
    case "section":
      return <DatabaseSectionField {...props} />;
    default:
      return <FormInput {...props} {...getInputProps(field)} nullable />;
  }
};

const getFieldType = (field: EngineField, override?: EngineFieldOverride) => {
  return override?.type ?? field.type;
};

const getFieldProps = (field: EngineField, override?: EngineFieldOverride) => {
  const placeholder =
    override?.placeholder ?? field.placeholder ?? field.default;

  return {
    name: override?.name ?? `details.${field.name}`,
    title: override?.title ?? field["display-name"],
    description: override?.description ?? field.description,
    placeholder: placeholder != null ? String(placeholder) : undefined,
    encoding: field["treat-before-posting"],
  };
};

const getInputProps = (field: EngineField) => {
  return {
    infoTooltip: field["helper-text"],
    rightIcon: field["helper-text"] && "info",
    rightIconTooltip: field["helper-text"],
  };
};

const getPasswordProps = (field: EngineField) => {
  return {
    ...getInputProps(field),
    type: "password",
  };
};

const getSelectProps = (field: EngineField, override?: EngineFieldOverride) => {
  return {
    options: override?.options ?? field.options ?? [],
  };
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseDetailField;
