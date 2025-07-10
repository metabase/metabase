import { useMemo, useState } from "react";

import { uuid } from "metabase/lib/uuid";
import { Box, Group } from "metabase/ui";

import {
  type ComponentMetadata,
  SystemComponentId,
} from "../const/systemComponents";
import { TRAVERSE_STOP, traverseComponentTree } from "../helpers";
import type { ComponentConfiguration, ComponentDefinition } from "../types";

import { ComponentPreviewRoot } from "./ComponentPreviewRoot";
import { ComponentSelectSidebar } from "./ComponentSelectSidebar";
import { ComponentSettingsSidebar } from "./ComponentSettingsSidebar";
import { EditableComponentTreeNode } from "./EditableComponentTreeNode";

export function ComponentEditor() {
  const initialComponent = useMemo<ComponentDefinition>(() => {
    return {
      id: uuid(),
      componentId: SystemComponentId.Placeholder,
    };
  }, []);

  const [selectedComponent, setSelectedComponent] =
    useState<ComponentDefinition | null>(initialComponent);

  const [componentConfiguration, setComponentConfiguration] =
    useState<ComponentConfiguration>({ root: initialComponent });

  const handleSelectInitialComponent = (component: ComponentMetadata) => {
    const componentDefinition: ComponentDefinition = {
      id: uuid(),
      componentId: component.id,
      value: component.defaultValue
        ? { type: "constant", value: component.defaultValue }
        : undefined,
    };

    if (component.hasChildren) {
      const placeholderComponent = {
        id: uuid(),
        componentId: SystemComponentId.Placeholder,
      };

      componentDefinition.children = [placeholderComponent];
      setSelectedComponent(placeholderComponent);
    } else {
      setSelectedComponent(componentDefinition);
    }

    setComponentConfiguration((state) => {
      const newState = { ...state };

      traverseComponentTree(newState.root, (component) => {
        if (component.id === selectedComponent?.id) {
          component.id = componentDefinition.id;
          component.componentId = componentDefinition.componentId;
          component.value = componentDefinition.value;
          component.style = componentDefinition.style;
          component.children = componentDefinition.children;

          return TRAVERSE_STOP;
        }
      });

      return newState;
    });
  };

  const handleSelectComponent = (component: ComponentDefinition) => {
    setSelectedComponent(component);
  };

  const handleComponentSettingsChange = (
    settings: Partial<ComponentDefinition>,
  ) => {
    setComponentConfiguration((state) => {
      const newState = { ...state };

      traverseComponentTree(newState.root, (component) => {
        if (component.id === selectedComponent?.id) {
          for (const [key, value] of Object.entries(settings)) {
            if (key in component) {
              (component as any)[key] = value;
            }
          }

          return TRAVERSE_STOP;
        }
      });

      return newState;
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
        <ComponentPreviewRoot configuration={componentConfiguration}>
          <EditableComponentTreeNode
            selectedComponent={selectedComponent}
            component={componentConfiguration.root}
            onSelect={handleSelectComponent}
          />
        </ComponentPreviewRoot>
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
          selectedComponent.componentId === SystemComponentId.Placeholder ? (
            <ComponentSelectSidebar
              onSelectComponent={handleSelectInitialComponent}
            />
          ) : (
            <ComponentSettingsSidebar
              component={selectedComponent}
              onComponentSettingsChange={handleComponentSettingsChange}
            />
          )
        ) : (
          <Box>{"Global Settings"}</Box>
        )}
      </Box>
    </Group>
  );
}
