import { Switch } from "@mantine/core";
import type {
  SearchFilterComponentProps,
  SearchFilterToggle,
} from "metabase/search/types";
import { Group, Text } from "metabase/ui";

export type ToggleSidebarFilterProps = {
  filter: SearchFilterToggle;
} & SearchFilterComponentProps;
export const ToggleSidebarFilter = ({
  filter: { title },
  value,
  onChange,
  "data-testid": dataTestId,
}: ToggleSidebarFilterProps) => (
  <Group noWrap px="0.25rem" py="0.5rem" data-testid={dataTestId}>
    <Text w="100%" c="text.1" fw={700}>
      {title}
    </Text>
    <Switch
      wrapperProps={{
        "data-testid": "toggle-filter-switch",
      }}
      size="sm"
      data-is-checked={Boolean(value)}
      checked={Boolean(value)}
      onChange={event =>
        onChange(event.currentTarget.checked ? true : undefined)
      }
    />
  </Group>
);
