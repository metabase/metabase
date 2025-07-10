import { IconApps, IconComponents } from "@tabler/icons-react";

import { Box, Stack, Tabs, Title } from "metabase/ui";

import {
  type ComponentMetadata,
  SYSTEM_COMPONENT_CATEGORIES,
} from "../const/systemComponents";

import { SelectableComponentGroup } from "./SelectableComponentGroup";

type Props = {
  onSelectComponent: (component: ComponentMetadata) => void;
};

export function ComponentSelectSidebar({ onSelectComponent }: Props) {
  return (
    <Box p="md">
      <Title order={3} mb="md">
        {"Pick a component"}
      </Title>
      <Tabs defaultValue="system">
        <Tabs.List>
          <Tabs.Tab value="system" leftSection={<IconComponents size={12} />}>
            {"System"}
          </Tabs.Tab>
          <Tabs.Tab value="custom" leftSection={<IconApps size={12} />}>
            {"Custom"}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="system" py="md">
          <Stack>
            {SYSTEM_COMPONENT_CATEGORIES.map((category) => (
              <SelectableComponentGroup
                key={category.title}
                title={category.title}
                components={category.components}
                onSelect={onSelectComponent}
              />
            ))}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="custom" py="md">
          {"Custom tab content"}
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
