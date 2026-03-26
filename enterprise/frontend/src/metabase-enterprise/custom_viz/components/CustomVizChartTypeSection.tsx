import { t } from "ttag";

import { CollapseSection } from "metabase/common/components/CollapseSection";
import { ChartTypeOption } from "metabase/query_builder/components/chart-type-selector";
import { Grid, Space, Text } from "metabase/ui";
import type { CardDisplayType } from "metabase-types/api";

import { useCustomVizPlugins } from "../custom-viz-plugins";

import S from "./CustomVizChartTypeSection.module.css";

interface CustomVizChartTypeSectionProps {
  selectedVisualization: CardDisplayType;
  onSelectVisualization: (display: CardDisplayType) => void;
  onOpenSettings: () => void;
}

export function CustomVizChartTypeSection({
  selectedVisualization,
  onSelectVisualization,
  onOpenSettings,
}: CustomVizChartTypeSectionProps) {
  const customVizPlugins = useCustomVizPlugins();

  if (!customVizPlugins || customVizPlugins.length === 0) {
    return null;
  }

  return (
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
            {customVizPlugins.map(plugin => {
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
  );
}
