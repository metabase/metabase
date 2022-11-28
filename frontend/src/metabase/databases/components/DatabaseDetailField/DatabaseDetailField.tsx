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
      return <FormToggle {...getDetailFieldProps(field)} />;
    default:
      return <FormInput {...getDetailFieldProps(field)} />;
  }
};

const getDetailFieldProps = (field: EngineField) => {
  return {
    name: `details.${field.name}`,
    title: field["display-name"],
    description: field.description,
    placeholder: field.placeholder,
    infoTooltip: field["helper-text"],
  };
};

export default DatabaseDetailField;
