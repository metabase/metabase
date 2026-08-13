import { useMemo } from "react";
import { t } from "ttag";

import { CollapseSection } from "metabase/common/components/CollapseSection";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";
import { Space, Stack, type StackProps, Text } from "metabase/ui";
import type { VisualizationDisplay } from "metabase-types/api";

import { ChartTypeList, type ChartTypeListProps } from "../ChartTypeList";

import S from "./ChartTypeSettings.module.css";
import type { ChartTypeGroup } from "./types";

export type ChartTypeSettingsProps = {
  sensibleVisualizations: ChartTypeListProps["visualizationList"];
  nonSensibleVisualizations: ChartTypeListProps["visualizationList"];
} & Pick<
  ChartTypeListProps,
  "selectedVisualization" | "onSelectVisualization" | "onOpenSettings"
> &
  StackProps;

export const ChartTypeSettings = ({
  selectedVisualization,
  onSelectVisualization,
  sensibleVisualizations,
  nonSensibleVisualizations,
  onOpenSettings,
  ...stackProps
}: ChartTypeSettingsProps) => {
  const collapsibleGroups = useMemo(() => {
    const builtIn: VisualizationDisplay[] = [];
    const custom: VisualizationDisplay[] = [];
    const groups: ChartTypeGroup[] = [
      { label: t`More charts`, testId: "more-charts-toggle", items: builtIn },
      {
        label: t`Custom visualizations`,
        testId: "custom-viz-plugins-toggle",
        items: custom,
      },
    ];
    for (const viz of nonSensibleVisualizations) {
      if (PLUGIN_CUSTOM_VIZ.isCustomVizDisplay(viz)) {
        custom.push(viz);
      } else {
        builtIn.push(viz);
      }
    }
    return groups.filter((group) => group.items.length);
  }, [nonSensibleVisualizations]);

  return (
    <Stack data-testid="chart-type-settings" {...stackProps}>
      <ChartTypeList
        data-testid="display-options-sensible"
        visualizationList={sensibleVisualizations}
        onSelectVisualization={onSelectVisualization}
        selectedVisualization={selectedVisualization}
        onOpenSettings={onOpenSettings}
      />

      {collapsibleGroups.map((group) => (
        <div key={group.testId}>
          <Space h="xl" />
          <CollapseSection
            header={
              <Text
                fw="bold"
                c="inherit"
                tt="uppercase"
                fz="sm"
                data-testid={group.testId}
              >
                {group.label}
              </Text>
            }
            headerClass={S.moreChartsHeader}
            initialState={
              group.items.includes(selectedVisualization)
                ? "expanded"
                : "collapsed"
            }
            iconPosition="right"
            iconSize={10}
          >
            <>
              <Space h="md" />
              <ChartTypeList
                data-testid={`display-options-${group.testId}`}
                visualizationList={group.items}
                onSelectVisualization={onSelectVisualization}
                selectedVisualization={selectedVisualization}
                onOpenSettings={onOpenSettings}
              />
            </>
          </CollapseSection>
        </div>
      ))}
    </Stack>
  );
};
