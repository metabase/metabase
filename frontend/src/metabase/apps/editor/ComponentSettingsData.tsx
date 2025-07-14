import { Select, Stack, TextInput } from "metabase/ui";

import type { ComponentContext } from "../hooks/use-component-context";
import type { ComponentDefinition } from "../types";

type Props = {
  componentContext: ComponentContext;
  component: ComponentDefinition;
  onComponentSettingsChange: (settings: Partial<ComponentDefinition>) => void;
};

export function ComponentSettingsData({
  componentContext,
  component,
  onComponentSettingsChange,
}: Props) {
  const handleChangeConstantValue = (value: string) => {
    onComponentSettingsChange({
      value: {
        type: "constant",
        value,
      },
    });
  };

  const handleChangeContextField = (value: string) => {
    onComponentSettingsChange({
      value: {
        type: "context",
        field: value,
      },
    });
  };

  const handleChangeContextType = (value: string) => {
    onComponentSettingsChange({
      value: {
        type: value as any,
      },
    });
  };

  return (
    <Stack gap="md">
      <Select
        label="Source Type"
        value={component.value?.type ?? "constant"}
        onChange={handleChangeContextType}
        data={[
          {
            label: "Constant Value",
            value: "constant",
          },
          {
            label: "Component Context",
            value: "context",
            disabled: componentContext.type !== "tableRow",
          },
          {
            label: "Data Source Parameter",
            value: "dataSource" as any,
            disabled: true,
          },
          {
            label: "Global Parameter",
            value: "global" as any,
            disabled: true,
          },
          {
            label: "Form Value",
            value: "form" as any,
            disabled: true,
          },
        ]}
      />
      {component.value?.type === "constant" && (
        <TextInput
          label="Constant Value"
          value={component.value?.value ?? ""}
          onChange={(e) => {
            handleChangeConstantValue(e.target.value);
          }}
        />
      )}
      {component.value?.type === "context" && (
        <Select
          label="Context Parameter"
          value={component.value?.field ?? ""}
          data={componentContext.parameters}
          onChange={(value) => {
            handleChangeContextField(value);
          }}
        />
      )}
    </Stack>
  );
}
