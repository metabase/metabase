import { uuid } from "metabase/lib/uuid";
import { Select, Stack } from "metabase/ui";

import { useCustomComponents } from "../hooks/use-apps";
import type { ComponentDefinition } from "../types";

import { SidebarSubtitle } from "./SidebarSubtitle";

type Props = {
  component: ComponentDefinition;
  onComponentSettingsChange: (settings: Partial<ComponentDefinition>) => void;
};

export function DataComponentSelect({
  component,
  onComponentSettingsChange,
}: Props) {
  const customComponents = useCustomComponents();

  return (
    <Stack gap="md">
      <SidebarSubtitle>{"List Component"}</SidebarSubtitle>
      <Select
        placeholder="Select a list component"
        data={
          customComponents.map((component) => ({
            label: component.title ?? "Untitled Component",
            value: component.id,
          })) ?? []
        }
        value={component.children?.[0]?.componentId}
        onChange={(value) => {
          onComponentSettingsChange({
            children: [
              {
                id: uuid(),
                componentId: value,
              },
            ],
          });
        }}
      />
    </Stack>
  );
}
