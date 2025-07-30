import {
  IconDatabase,
  IconListTree,
  IconPalette,
  IconTrash,
} from "@tabler/icons-react";

import { Box, Button, Tabs, Text, Title } from "metabase/ui";

import { getComponentName } from "../helpers";
import type { ComponentContext } from "../hooks/use-component-context";
import type { ComponentConfiguration, ComponentDefinition } from "../types";

import { ComponentSettingsData } from "./ComponentSettingsData";
import { ComponentSettingsStyle } from "./ComponentSettingsStyle";
import { SidebarTree } from "./SidebarTree";

type Props = {
  componentConfiguration: ComponentConfiguration;
  componentContext: ComponentContext;
  component: ComponentDefinition;
  onComponentSettingsChange: (settings: Partial<ComponentDefinition>) => void;
  onDeleteComponent: (component: ComponentDefinition) => void;
  onSelectComponent: (component: ComponentDefinition) => void;
};

export function ComponentSettingsSidebar({
  componentConfiguration,
  componentContext,
  component,
  onComponentSettingsChange,
  onDeleteComponent,
  onSelectComponent,
}: Props) {
  return (
    <Box p="md">
      <Box>
        <Title order={3} lh="1.5">
          {"Component Settings"}
        </Title>
        <Text c="text-secondary" size="sm">
          {getComponentName(component)}: {component.id}
        </Text>
      </Box>
      <Button
        mt="md"
        variant="filled"
        color="error"
        size="xs"
        leftSection={<IconTrash size={12} />}
        onClick={() => onDeleteComponent(component)}
      >
        {"Delete"}
      </Button>
      <Tabs defaultValue="data" mt="md">
        <Tabs.List>
          <Tabs.Tab value="data" leftSection={<IconDatabase size={12} />}>
            {"Data"}
          </Tabs.Tab>
          <Tabs.Tab value="style" leftSection={<IconPalette size={12} />}>
            {"Style"}
          </Tabs.Tab>
          <Tabs.Tab value="tree" leftSection={<IconListTree size={12} />}>
            {"Tree"}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="data" py="md">
          <ComponentSettingsData
            componentConfiguration={componentConfiguration}
            component={component}
            componentContext={componentContext}
            onComponentSettingsChange={onComponentSettingsChange}
          />
        </Tabs.Panel>
        <Tabs.Panel value="style" py="md">
          <ComponentSettingsStyle
            component={component}
            onComponentSettingsChange={onComponentSettingsChange}
          />
        </Tabs.Panel>
        <Tabs.Panel value="tree" py="md">
          <SidebarTree
            configuration={componentConfiguration}
            selectedComponent={component}
            onSelectComponent={onSelectComponent}
          />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
