import { Stack } from "metabase/ui";

import { SYSTEM_COMPONENTS_MAP } from "../const/systemComponents";
import type { ComponentContext } from "../hooks/use-component-context";
import type { ComponentConfiguration, ComponentDefinition } from "../types";

import { DataComponentSelect } from "./DataComponentSelect";
import { DataSourceSelect } from "./DataSourceSelect";
import { DataValueSelect } from "./DataValueSelect";

type Props = {
  componentConfiguration: ComponentConfiguration;
  componentContext: ComponentContext;
  component: ComponentDefinition;
  onComponentSettingsChange: (settings: Partial<ComponentDefinition>) => void;
};

export function ComponentSettingsData({
  componentConfiguration,
  componentContext,
  component,
  onComponentSettingsChange,
}: Props) {
  const DATA_VARIABLES =
    SYSTEM_COMPONENTS_MAP[component.componentId]?.dataVariables;

  if (!DATA_VARIABLES) {
    return null;
  }

  return (
    <Stack gap="md">
      {DATA_VARIABLES.map((variable, index) => {
        switch (variable.type) {
          case "value":
            return (
              <DataValueSelect
                key={index}
                componentContext={componentContext}
                component={component}
                onComponentSettingsChange={onComponentSettingsChange}
              />
            );

          case "dataSource":
            return (
              <DataSourceSelect
                key={index}
                componentConfiguration={componentConfiguration}
                component={component}
                onComponentSettingsChange={onComponentSettingsChange}
              />
            );

          case "childComponentSelect":
            return (
              <DataComponentSelect
                key={index}
                component={component}
                onComponentSettingsChange={onComponentSettingsChange}
              />
            );

          default:
            return null;
        }
      })}
    </Stack>
  );
}
