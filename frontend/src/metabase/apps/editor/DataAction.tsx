import { Select, Stack } from "metabase/ui";

import { SidebarSubtitle } from "./SidebarSubtitle";

export function DataAction() {
  return (
    <Stack gap="md">
      <SidebarSubtitle>{"On Click Action"}</SidebarSubtitle>
      <Select
        placeholder="Select a action"
        data={[
          {
            label: "Navigate to page",
            value: "navigateToPage" as any,
            disabled: true,
          },
          {
            label: "Open page as modal",
            value: "openModal" as any,
            disabled: true,
          },
          {
            label: "Submit form",
            value: "submitForm" as any,
            disabled: true,
          },
        ]}
      />
    </Stack>
  );
}
