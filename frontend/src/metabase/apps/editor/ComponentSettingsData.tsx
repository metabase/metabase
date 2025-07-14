import { Select, Stack, TextInput } from "metabase/ui";

import type { ComponentDefinition } from "../types";

type Props = {
  component: ComponentDefinition;
  onComponentSettingsChange: (settings: Partial<ComponentDefinition>) => void;
};

export function ComponentSettingsData({
  component,
  onComponentSettingsChange,
}: Props) {
  const type = (component.value?.type as string) ?? "constant";

  const handleChangeConstantValue = (value: string) => {
    onComponentSettingsChange({
      value: {
        type: "constant",
        value,
      },
    });
  };

  return (
    <Stack gap="md">
      <Select
        label="Source Type"
        value={type}
        data={[
          {
            label: "Constant Value",
            value: "constant",
          },
          {
            label: "Component Context",
            value: "context",
            disabled: true,
          },
          {
            label: "Data Source Parameter",
            value: "dataSource",
            disabled: true,
          },
          {
            label: "Global Parameter",
            value: "global",
            disabled: true,
          },
          {
            label: "Form Value",
            value: "form",
            disabled: true,
          },
        ]}
      />
      {type === "constant" && (
        <TextInput
          label="Constant Value"
          value={component.value?.value ?? ""}
          onChange={(e) => {
            handleChangeConstantValue(e.target.value);
          }}
        />
      )}
    </Stack>
  );
}
