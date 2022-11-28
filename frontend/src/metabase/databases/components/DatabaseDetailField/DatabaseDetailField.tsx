import React from "react";
import { EngineField } from "metabase-types/api";
import FormToggle from "metabase/core/components/FormToggle";
import FormInput from "metabase/core/components/FormInput";
import { FIELD_OVERRIDES } from "../../constants";
import { EngineFieldOverride } from "../../types";

export interface DatabaseDetailFieldProps {
  field: EngineField;
}

const DatabaseDetailField = ({
  field,
}: DatabaseDetailFieldProps): JSX.Element => {
  const override = FIELD_OVERRIDES[field.name];

  if (override.type) {
    const Field = override.type;
    return <Field />;
  }

  switch (field.type) {
    case "boolean":
      return <FormToggle {...getFieldProps(field, override)} />;
    default:
      return <FormInput {...getStringFieldProps(field, override)} nullable />;
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

const getStringFieldProps = (
  field: EngineField,
  override?: EngineFieldOverride,
) => {
  return {
    ...getFieldProps(field, override),
    infoTooltip: field["helper-text"],
    rightIcon: field["helper-text"] && "info",
    rightIconTooltip: field["helper-text"],
  };
};

export default DatabaseDetailField;
