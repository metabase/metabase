import { useState } from "react";

import { uuid } from "metabase/lib/uuid";
import { Box, Group, Stack } from "metabase/ui";

import {
  type ComponentMetadata,
  SystemComponentId,
} from "../const/systemComponents";
import { TRAVERSE_STOP, traverseComponentTree } from "../helpers";
import {
  getInitialComponentConfiguration,
  useApp,
  useSaveApp,
} from "../hooks/use-apps";
import { useComponentContext } from "../hooks/use-component-context";
import type { ComponentConfiguration, ComponentDefinition } from "../types";

import { ComponentEditorHeader } from "./ComponentEditorHeader";
import { ComponentMetadataSidebar } from "./ComponentMetadataSidebar";
import { ComponentPreviewRoot } from "./ComponentPreviewRoot";
import { ComponentSelectSidebar } from "./ComponentSelectSidebar";
import { ComponentSettingsSidebar } from "./ComponentSettingsSidebar";
import { EditableComponentTreeNode } from "./EditableComponentTreeNode";

type Props = {
  params: {
    id?: string;
  };
};

export function ComponentEditor({ params }: Props) {
  const saveApp = useSaveApp();
  const app = useApp(params.id) ?? getInitialComponentConfiguration();

  const [selectedComponent, setSelectedComponent] =
    useState<ComponentDefinition | null>(null);

  const [configureSelectedTab, setConfigureSelectedTab] = useState<
    "globalSettings" | "componentTree" | null
  >("globalSettings");

  const [componentConfiguration, setComponentConfiguration] =
    useState<ComponentConfiguration>(app as ComponentConfiguration);

  const componentContext = useComponentContext({
    component: componentConfiguration,
  });

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
            (component as any)[key] = value;
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

  const handleComponentConfigurationChange = (
    configuration: Partial<ComponentConfiguration>,
  ) => {
    setComponentConfiguration((state) => {
      return { ...state, ...configuration };
    });
  };

  const handleAddComponent = (
    position: "top" | "bottom" | "left" | "right",
    component: ComponentDefinition,
    parentComponent?: ComponentDefinition,
  ) => {
    const placeholderComponent = {
      id: uuid(),
      componentId: SystemComponentId.Placeholder,
    };

    setComponentConfiguration((state) => {
      const newState = { ...state };

      if (!parentComponent) {
        const newRoot = {
          id: uuid(),
          componentId:
            position === "top" || position === "bottom"
              ? SystemComponentId.Stack
              : SystemComponentId.Group,
          children: [newState.root],
        };

        if (position === "top" || position === "left") {
          newRoot.children.unshift(placeholderComponent);
        } else {
          newRoot.children.push(placeholderComponent);
        }

        newState.root = newRoot;
      } else {
        traverseComponentTree(newState.root, (node) => {
          if (node.id === parentComponent.id) {
            if (
              node.componentId === SystemComponentId.Stack ||
              node.componentId === SystemComponentId.Group
            ) {
              const index = node.children?.findIndex(
                (child) => child.id === component?.id,
              );

              if (index === undefined) {
                return TRAVERSE_STOP;
              }

              if (position === "top" || position === "left") {
                node.children!.splice(index, 0, placeholderComponent);
              } else {
                node.children!.splice(index + 1, 0, placeholderComponent);
              }
            } else {
              const stackOrGroup = {
                id: uuid(),
                componentId:
                  position === "top" || position === "bottom"
                    ? SystemComponentId.Stack
                    : SystemComponentId.Group,
                children: [component],
              };

              if (position === "top" || position === "left") {
                stackOrGroup.children.unshift(placeholderComponent);
              } else {
                stackOrGroup.children.push(placeholderComponent);
              }

              node.children = [stackOrGroup];
            }

            return TRAVERSE_STOP;
          }
        });
      }

      return newState;
    });

    setSelectedComponent(placeholderComponent);
  };

  return (
    <Stack gap="0" p="0" h="100%" w="100%">
      <ComponentEditorHeader
        configuration={componentConfiguration}
        onSaveClick={() => {
          saveApp(componentConfiguration);
          document.location = "/browse/apps";
        }}
        onConfigureClick={() => {
          setSelectedComponent(null);
          setConfigureSelectedTab("globalSettings");
        }}
      />
      <Group gap="0" p="0" h="calc(100% - 73px)" align="flex-start" bg="white">
        <Box
          flex={1}
          h="100%"
          style={{ overflow: "auto" }}
          onClick={() => {
            setSelectedComponent(null);
            setConfigureSelectedTab("componentTree");
          }}
        >
          <ComponentPreviewRoot configuration={componentConfiguration}>
            <EditableComponentTreeNode
              componentContext={componentContext}
              selectedComponent={selectedComponent}
              component={componentConfiguration.root}
              onSelect={handleSelectComponent}
              onAddComponent={handleAddComponent}
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
                componentContext={componentContext}
                component={selectedComponent}
                onComponentSettingsChange={handleComponentSettingsChange}
              />
            )
          ) : (
            <ComponentMetadataSidebar
              tab={configureSelectedTab}
              configuration={componentConfiguration}
              onConfigurationChange={handleComponentConfigurationChange}
            />
          )}
        </Box>
      </Group>
    </Stack>
  );
}
