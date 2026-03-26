import { t } from "ttag";

import { CollapseSection } from "metabase/common/components/CollapseSection";
import { Grid, Space, Stack, type StackProps, Text } from "metabase/ui";
import type {
  CardDisplayType,
  CustomVizPluginRuntime,
} from "metabase-types/api";

import { ChartTypeList, type ChartTypeListProps } from "../ChartTypeList";
import { ChartTypeOption } from "../ChartTypeOption";

import S from "./ChartTypeSettings.module.css";

export type ChartTypeSettingsProps = {
  sensibleVisualizations: ChartTypeListProps["visualizationList"];
  nonSensibleVisualizations: ChartTypeListProps["visualizationList"];
  customVizPlugins?: CustomVizPluginRuntime[];
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
  customVizPlugins,
  ...stackProps
}: ChartTypeSettingsProps) => {
  return (
    <Stack data-testid="chart-type-settings" {...stackProps}>
      <ChartTypeList
        data-testid="display-options-sensible"
        visualizationList={sensibleVisualizations}
        onSelectVisualization={onSelectVisualization}
        selectedVisualization={selectedVisualization}
        onOpenSettings={onOpenSettings}
      />

      <Space h="xl" />

      <CollapseSection
        header={
          <Text
            fw="bold"
            c="inherit"
            tt="uppercase"
            fz="sm"
            data-testid="more-charts-toggle"
          >{t`More charts`}</Text>
        }
        headerClass={S.moreChartsHeader}
        initialState={
          nonSensibleVisualizations.includes(selectedVisualization)
            ? "expanded"
            : "collapsed"
        }
        iconPosition="right"
        iconSize={10}
      >
        <>
          <Space h="md" />
          <ChartTypeList
            data-testid="display-options-not-sensible"
            visualizationList={nonSensibleVisualizations}
            onSelectVisualization={onSelectVisualization}
            selectedVisualization={selectedVisualization}
            onOpenSettings={onOpenSettings}
          />
        </>
      </CollapseSection>
      {customVizPlugins && customVizPlugins.length > 0 && (
        <>
          <Space h="xl" />
          <CollapseSection
            header={
              <Text
                fw="bold"
                c="inherit"
                tt="uppercase"
                fz="sm"
                data-testid="custom-viz-plugins-toggle"
              >{t`Custom visualizations`}</Text>
            }
            headerClass={S.moreChartsHeader}
            initialState="expanded"
            iconPosition="right"
            iconSize={10}
          >
            <>
              <Space h="md" />
              <Grid
                data-testid="display-options-custom-viz"
                align="flex-start"
                justify="flex-start"
                grow={false}
              >
                {customVizPlugins.map((plugin) => {
                  const displayType =
                    `custom:${plugin.identifier}` as CardDisplayType;
                  return (
                    <Grid.Col
                      span={3}
                      key={plugin.id}
                      data-testid="chart-type-list-col"
                    >
                      <ChartTypeOption
                        visualizationType={displayType}
                        selectedVisualization={selectedVisualization}
                        onSelectVisualization={onSelectVisualization}
                        onOpenSettings={onOpenSettings}
                      />
                    </Grid.Col>
                  );
                })}
              </Grid>
            </>
          </CollapseSection>
        </>
      )}
    </Stack>
  );
};
