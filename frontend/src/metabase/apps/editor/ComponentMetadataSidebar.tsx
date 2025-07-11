import { IconListTree, IconSettings } from "@tabler/icons-react";

import { Box, Tabs } from "metabase/ui";

import type { ComponentConfiguration } from "../types";

import { ComponentGlobalSettings } from "./ComponentGlobalSettings";

type Props = {
  configuration: ComponentConfiguration;
  onConfigurationChange: (
    configuration: Partial<ComponentConfiguration>,
  ) => void;
};

export function ComponentMetadataSidebar({
  configuration,
  onConfigurationChange,
}: Props) {
  return (
    <Box p="md">
      <Tabs defaultValue="globalSettings">
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
          {"TODO"}
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
