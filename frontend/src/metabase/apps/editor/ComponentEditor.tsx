import { useState } from "react";

import { uuid } from "metabase/lib/uuid";
import { Box, Group } from "metabase/ui";

import type { ComponentMetadata } from "../const/systemComponents";
import type { ComponentConfiguration, ComponentDefinition } from "../types";

import { ComponentPreviewRoot } from "./ComponentPreviewRoot";
import { ComponentSelectSidebar } from "./ComponentSelectSidebar";
import { ComponentSettingsSidebar } from "./ComponentSettingsSidebar";
import { ComponentsEmtpyState } from "./ComponentsEmtpyState";
import { EditableComponentTreeNode } from "./EditableComponentTreeNode";

export function ComponentEditor() {
  const [selectedComponent, setSelectedComponent] =
    useState<ComponentDefinition | null>(null);

  const [componentConfiguration, setComponentConfiguration] =
    useState<ComponentConfiguration>({});

  const handleSelectInitialComponent = (component: ComponentMetadata) => {
    setComponentConfiguration((state) => ({
      ...state,
      root: {
        id: uuid(),
        componentId: component.id,
        name: component.name,
        description: component.description,
        value: component.defaultValue
          ? { type: "constant", value: component.defaultValue }
          : undefined,
        style: {
          ...component.styleVariables?.reduce(
            (acc, variable) => {
              acc[variable.key] = variable.defaultValue;
              return acc;
            },
            {} as Record<string, any>,
          ),
        },
      },
    }));
  };

  const handleSelectComponent = (component: ComponentDefinition) => {
    setSelectedComponent(component);
  };

  const handleComponentSettingsChange = (
    settings: Partial<ComponentDefinition>,
  ) => {
    setComponentConfiguration((state) => {
      return {
        ...state,
        root: { ...state.root, ...settings } as ComponentDefinition,
      };
    });
    setSelectedComponent((state) => {
      if (!state) {
        return null;
      }
      return { ...state, ...settings };
    });
  };

  return (
    <Group gap="0" p="0" h="100%" align="flex-start" bg="white">
      <Box flex={1} h="100%" style={{ overflow: "auto" }}>
        {componentConfiguration.root ? (
          <ComponentPreviewRoot configuration={componentConfiguration}>
            <EditableComponentTreeNode
              selectedComponent={selectedComponent}
              component={componentConfiguration.root}
              onSelect={handleSelectComponent}
            />
          </ComponentPreviewRoot>
        ) : (
          <ComponentsEmtpyState />
        )}
      </Box>
      <Box
        w="20rem"
        h="100%"
        style={{
          borderLeft: "1px solid var(--mb-color-border)",
          overflow: "auto",
        }}
      >
        {selectedComponent ? (
          <ComponentSettingsSidebar
            component={selectedComponent}
            onComponentSettingsChange={handleComponentSettingsChange}
          />
        ) : (
          <ComponentSelectSidebar
            onSelectComponent={handleSelectInitialComponent}
          />
        )}
      </Box>
    </Group>
  );
}
