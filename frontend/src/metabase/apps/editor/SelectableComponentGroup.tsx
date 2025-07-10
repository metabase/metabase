import { Stack, Text } from "metabase/ui";

import type { ComponentMetadata } from "../const/systemComponents";

import { SelectableComponent } from "./SelectableComponent";

type Props = {
  title: string;
  components: ComponentMetadata[];
  onSelect: (component: ComponentMetadata) => void;
};

export function SelectableComponentGroup({
  title,
  components,
  onSelect,
}: Props) {
  return (
    <>
      <Text fw={700} fz="sm" lts={1} lh={1} tt="uppercase" c="text-secondary">
        {title}
      </Text>
      <Stack gap="xs">
        {components.map((component) => (
          <SelectableComponent
            key={component.name}
            component={component}
            onClick={onSelect}
          />
        ))}
      </Stack>
    </>
  );
}
