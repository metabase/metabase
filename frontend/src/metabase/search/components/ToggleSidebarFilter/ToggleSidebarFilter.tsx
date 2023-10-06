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
  filter: { label },
  value,
  onChange,
  "data-testid": dataTestId,
}: ToggleSidebarFilterProps) => {
  return (
    <Group noWrap py="0.5rem" spacing="xs" data-testid={dataTestId}>
      <Text w="100%" c="text.1" size="md" fw={700}>
        {typeof label === "function" ? label() : label}
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
