import { FormFileInput } from "metabase/common/components/FormFileInput";
import {
  FormNumberInput,
  FormSelect,
  FormSwitch,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Icon, type SwitchProps, Tooltip } from "metabase/ui";
import type {
  Engine,
  EngineField,
  EngineFieldOption,
  EngineKey,
} from "metabase-types/api";

import { FIELD_OVERRIDES } from "../constants";
import type { EngineFieldOverride, FieldType } from "../types";

import { DatabaseHostnameWithProviderField } from "./DatabaseHostnameWithProviderField/DatabaseHostnameWithProviderField";
import DatabaseInfoField from "./DatabaseInfoField";
import DatabaseSectionField from "./DatabaseSectionField";
import { getSharedFieldStyleProps } from "./styles";

export interface DatabaseDetailFieldProps {
  field: EngineField;
  autoFocus?: boolean;
  engineKey: EngineKey | undefined;
  engine: Engine | undefined;
}

export const DatabaseDetailField = ({
  field,
  autoFocus,
  engineKey,
  engine,
}: DatabaseDetailFieldProps): JSX.Element | null => {
  const override = FIELD_OVERRIDES[field.name];
  const type = getFieldType(field, override);
  const props = {
    ...(autoFocus ? { autoFocus, "data-autofocus": autoFocus } : {}),
    ...getFieldProps(field, override, type),
  };

  if (field.name === "host" && engineKey === "postgres") {
    return (
      <DatabaseHostnameWithProviderField
        {...props}
        {...getInputProps(field)}
        nullable
        providers={engine?.["extra-info"]?.providers}
      />
    );
  }
  if (typeof type === "function") {
    const Component = type;
    return <Component {...props} />;
  }

  switch (type) {
    case "password":
      return <FormTextInput {...props} {...getPasswordProps(field)} nullable />;
    case "text":
      return <FormTextarea {...props} />;
    case "integer":
      return <FormNumberInput {...props} {...getInputProps(field)} nullable />;
    case "boolean":
      return <FormSwitch {...props} {...getSwitchProps()} />;
    case "select":
      return <FormSelect {...props} {...getSelectProps(field, override)} />;
    case "textFile":
      return <FormFileInput {...props} />;
    case "info":
      return <DatabaseInfoField {...props} />;
    case "section":
      return <DatabaseSectionField {...props} />;
    case "hidden":
      return null;
    default:
      return <FormTextInput {...props} {...getInputProps(field)} nullable />;
  }
};

const getSwitchProps = (): SwitchProps => ({
  labelPosition: "left" as const,
  styles: {
    body: {
      justifyContent: "space-between",
    },
    label: {
      fontWeight: "bold",
      fontSize: "var(--mantine-font-size-md)",
    },
  },
});

const getFieldType = (field: EngineField, override?: EngineFieldOverride) => {
  return override?.type ?? field.type;
};

const getFieldProps = (
  field: EngineField,
  override: EngineFieldOverride | undefined,
  type: FieldType | undefined,
) => {
  const placeholder =
    override?.placeholder ?? field.placeholder ?? field.default;

  return {
    name: override?.name ?? `details.${field.name}`,
    label: override?.title ?? field["display-name"],
    title: override?.title ?? field["display-name"],
    description: override?.description ?? field.description,
    placeholder: placeholder != null ? String(placeholder) : undefined,
    encoding: field["treat-before-posting"],
    ...getSharedFieldStyleProps(type),
  };
};

const getInputProps = (field: EngineField) => {
  const icon = field["helper-text"] ? <Icon name="info" /> : undefined;

  const rightSection =
    field["helper-text"] && icon ? (
      <Tooltip label={field["helper-text"]}>{icon}</Tooltip>
    ) : (
      icon
    );

  return {
    rightSection,
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
    data: convertEngineFieldOptionsToSelectOptions(
      override?.options ?? field.options ?? [],
    ),
  };
};

const convertEngineFieldOptionsToSelectOptions = (
  options: EngineFieldOption[],
) => {
  return options.map((option) => ({ label: option.name, value: option.value }));
};
