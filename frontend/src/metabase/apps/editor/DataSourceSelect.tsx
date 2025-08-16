import { Select, Stack } from "metabase/ui";

import type { ComponentConfiguration, ComponentDefinition } from "../types";

import { SidebarSubtitle } from "./SidebarSubtitle";

type Props = {
  componentConfiguration: ComponentConfiguration;
  component: ComponentDefinition;
  onComponentSettingsChange: (settings: Partial<ComponentDefinition>) => void;
};

export function DataSourceSelect({
  componentConfiguration,
  component,
  onComponentSettingsChange,
}: Props) {
  return (
    <Stack gap="md">
      <SidebarSubtitle>{"Data Source"}</SidebarSubtitle>
      <Select
        placeholder="Select a data source"
        data={
          componentConfiguration.dataSources?.map((dataSource) => ({
            label: dataSource.name ?? dataSource.id,
            value: dataSource.id,
          })) ?? []
        }
        value={component.dataSourceId}
        onChange={(value) => {
          onComponentSettingsChange({
            dataSourceId: value,
          });
        }}
      />
    </Stack>
  );
}
