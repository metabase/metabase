/*
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 * TODO: Change mantine switch import before merging!!
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 * */

// eslint-disable-next-line no-restricted-imports
import { Switch } from "@mantine/core";
import type { SearchFilterToggle } from "metabase/search/types";
import { Group, Text } from "metabase/ui";

export type ToggleSidebarFilterProps = {
  filter: SearchFilterToggle;
  value: boolean;
  onChange: (value: boolean) => void;
  "data-testid"?: string;
};
export const ToggleSidebarFilter = ({
  filter: { title },
  value,
  onChange,
  "data-testid": dataTestId,
}: ToggleSidebarFilterProps) => {
  return (
    <Group noWrap px="0.25rem" py="0.5rem" data-testid={dataTestId}>
      <Text w="100%" c="text.1" fw={700}>
        {title}
      </Text>
      <Switch
        wrapperProps={{
          "data-testid": "toggle-filter-switch",
        }}
        size="sm"
        data-is-checked={value}
        checked={value}
        onChange={event => onChange(event.currentTarget.checked)}
      />
    </Group>
  );
};
