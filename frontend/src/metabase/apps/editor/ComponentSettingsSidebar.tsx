import { IconDatabase, IconListTree, IconPalette } from "@tabler/icons-react";

import { Box, Tabs, Text, Title } from "metabase/ui";

import { getComponentName } from "../helpers";
import type { ComponentDefinition } from "../types";

import { ComponentSettingsData } from "./ComponentSettingsData";
import { ComponentSettingsStyle } from "./ComponentSettingsStyle";

type Props = {
  component: ComponentDefinition;
  onComponentSettingsChange: (settings: Partial<ComponentDefinition>) => void;
};

export function ComponentSettingsSidebar({
  component,
  onComponentSettingsChange,
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
            component={component}
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
          {"TODO"}
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
