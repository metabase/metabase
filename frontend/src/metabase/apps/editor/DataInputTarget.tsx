import { Select, Stack } from "metabase/ui";

import { SidebarSubtitle } from "./SidebarSubtitle";

export function DataInputTarget() {
  return (
    <Stack gap="md">
      <SidebarSubtitle>{"Input Target"}</SidebarSubtitle>
      <Select
        placeholder="Select a input target"
        data={[
          {
            label: "Update Form Value",
            value: "form" as any,
            disabled: true,
          },
          {
            label: "Filter Data Source",
            value: "dataSource" as any,
            disabled: true,
          },
        ]}
      />
    </Stack>
  );
}
