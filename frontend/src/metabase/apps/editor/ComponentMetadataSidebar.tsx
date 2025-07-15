import { IconListTree, IconSettings } from "@tabler/icons-react";

import { Box, Tabs } from "metabase/ui";

import type { ComponentConfiguration, ComponentDefinition } from "../types";

import { ComponentGlobalSettings } from "./ComponentGlobalSettings";
import { SidebarTree } from "./SidebarTree";

type Props = {
  tab: "globalSettings" | "componentTree" | null;
  configuration: ComponentConfiguration;
  selectedComponent?: ComponentDefinition;
  onSelectComponent: (component: ComponentDefinition) => void;
  onConfigurationChange: (
    configuration: Partial<ComponentConfiguration>,
  ) => void;
};

export function ComponentMetadataSidebar({
  tab,
  configuration,
  selectedComponent,
  onSelectComponent,
  onConfigurationChange,
}: Props) {
  return (
    <Box p="md">
      <Tabs defaultValue={tab ?? "globalSettings"}>
        <Tabs.List>
          <Tabs.Tab
            value="globalSettings"
            leftSection={<IconSettings size={12} />}
          >
            {"Settings"}
          </Tabs.Tab>
          <Tabs.Tab
            value="componentTree"
            leftSection={<IconListTree size={12} />}
          >
            {"Component Tree"}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel py="md" value="globalSettings">
          <ComponentGlobalSettings
            configuration={configuration}
            onConfigurationChange={onConfigurationChange}
          />
        </Tabs.Panel>
        <Tabs.Panel py="md" value="componentTree">
          <SidebarTree
            configuration={configuration}
            selectedComponent={selectedComponent}
            onSelectComponent={onSelectComponent}
          />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
