import React from "react";
import { EngineField } from "metabase-types/api";
import FormToggle from "metabase/core/components/FormToggle";
import FormInput from "metabase/core/components/FormInput";

export interface DatabaseDetailFieldProps {
  field: EngineField;
}

const DatabaseDetailField = ({
  field,
}: DatabaseDetailFieldProps): JSX.Element => {
  switch (field.type) {
    case "boolean":
      return <FormToggle {...getFieldProps(field)} />;
    default:
      return <FormInput {...getStringFieldProps(field)} nullable />;
  }
};

const getFieldProps = (field: EngineField) => {
  return {
    name: `details.${field.name}`,
    title: field["display-name"],
    description: field.description,
    placeholder: field.placeholder,
  };
};

const getStringFieldProps = (field: EngineField) => {
  return {
    ...getFieldProps(field),
    infoTooltip: field["helper-text"],
    rightIcon: field["helper-text"] && "info",
    rightIconTooltip: field["helper-text"],
  };
};

export default DatabaseDetailField;
