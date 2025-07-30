import { Stack } from "metabase/ui";

import { SYSTEM_COMPONENTS_MAP } from "../const/systemComponents";
import type { ComponentDefinition } from "../types";

import { ComponentSettingsStyleInput } from "./ComponentSettingsStyleInput";

type Props = {
  component: ComponentDefinition;
  onComponentSettingsChange: (settings: Partial<ComponentDefinition>) => void;
};

export function ComponentSettingsStyle({
  component,
  onComponentSettingsChange,
}: Props) {
  const STYLE_VARIABLES =
    SYSTEM_COMPONENTS_MAP[component.componentId]?.styleVariables;

  if (!STYLE_VARIABLES) {
    return null;
  }

  return (
    <Stack>
      {STYLE_VARIABLES.map((variable) => (
        <ComponentSettingsStyleInput
          key={variable.key}
          component={component}
          styleVariable={variable}
          onComponentSettingsChange={onComponentSettingsChange}
        />
      ))}
    </Stack>
  );
}
