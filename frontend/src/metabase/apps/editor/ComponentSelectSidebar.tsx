import { IconApps, IconComponents } from "@tabler/icons-react";

import { Box, Stack, Tabs, Text, Title } from "metabase/ui";

import {
  type ComponentMetadata,
  SYSTEM_COMPONENT_CATEGORIES,
} from "../const/systemComponents";
import { useApps } from "../hooks/use-apps";

import { SelectableComponent } from "./SelectableComponent";
import { SelectableComponentGroup } from "./SelectableComponentGroup";

type Props = {
  onSelectComponent: (component: ComponentMetadata) => void;
};

export function ComponentSelectSidebar({ onSelectComponent }: Props) {
  const apps = useApps();

  const customComponents = apps.filter((app) => app.type === "component");

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
          <Stack gap="xs">
            {customComponents.length === 0 && (
              <Text c="text-secondary">
                {`No custom components found. Create one to get started.`}
              </Text>
            )}
            {customComponents.map((component) => (
              <SelectableComponent
                key={component.id}
                component={{
                  id: component.id,
                  name: component.title ?? "Untitled Component",
                  category: "custom" as any,
                  description: "Custom component",
                  icon: IconComponents,
                }}
                onClick={onSelectComponent}
              />
            ))}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
