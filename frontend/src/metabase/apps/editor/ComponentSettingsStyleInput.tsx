/* eslint-disable no-restricted-imports */
import { ColorInput } from "@mantine/core";

import { Checkbox, Select, TextInput } from "metabase/ui";

import type { StyleVariable } from "../const/systemComponents";
import type { ComponentDefinition } from "../types";

type Props = {
  component: ComponentDefinition;
  styleVariable: StyleVariable;
  onComponentSettingsChange: (settings: Partial<ComponentDefinition>) => void;
};

export function ComponentSettingsStyleInput({
  component,
  styleVariable,
  onComponentSettingsChange,
}: Props) {
  const handleChange = (value: string | number | boolean) => {
    onComponentSettingsChange({
      style: { ...component.style, [styleVariable.key]: value },
    });
  };

  if (styleVariable.options) {
    return (
      <Select
        label={styleVariable.name}
        value={
          component.style?.[styleVariable.key]?.toString() ??
          styleVariable.defaultValue.toString()
        }
        onChange={(value) => {
          const valueToSave =
            styleVariable.type === "number" ? Number(value) : value;
          handleChange(valueToSave);
        }}
        data={styleVariable.options.map((option) => ({
          label: option.toString(),
          value: option.toString(),
        }))}
      />
    );
  }
  switch (styleVariable.type) {
    case "string":
      return (
        <TextInput
          label={styleVariable.name}
          value={
            component.style?.[styleVariable.key]?.toString() ??
            styleVariable.defaultValue.toString()
          }
          onChange={(e) => handleChange(e.target.value)}
        />
      );
    case "number":
      return (
        <TextInput
          label={styleVariable.name}
          value={
            component.style?.[styleVariable.key]?.toString() ??
            styleVariable.defaultValue.toString()
          }
          onChange={(e) => handleChange(Number(e.target.value))}
        />
      );
    case "boolean":
      return (
        <Checkbox
          label={styleVariable.name}
          checked={
            component.style?.[styleVariable.key]
              ? Boolean(component.style?.[styleVariable.key])
              : Boolean(styleVariable.defaultValue)
          }
          onChange={(e) => handleChange(e.target.checked)}
        />
      );
    case "color":
      return (
        <ColorInput
          label={styleVariable.name}
          styles={{
            input: {
              paddingLeft: "2rem",
            },
          }}
          value={
            component.style?.[styleVariable.key]?.toString() ??
            styleVariable.defaultValue.toString()
          }
          onChange={(value) => handleChange(value)}
        />
      );
  }
}
