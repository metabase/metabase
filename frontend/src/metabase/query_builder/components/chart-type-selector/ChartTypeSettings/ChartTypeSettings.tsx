import cx from "classnames";
import { t } from "ttag";

import { CollapseSection } from "metabase/common/components/CollapseSection";
import {
  ActionIcon,
  Center,
  Grid,
  Icon,
  type IconName,
  Space,
  Stack,
  type StackProps,
  Text,
} from "metabase/ui";
import type { CustomVizPluginRuntime } from "metabase-types/api";

import { ChartTypeList, type ChartTypeListProps } from "../ChartTypeList";
import ChartTypeOptionS from "../ChartTypeOption/ChartTypeOption.module.css";

import S from "./ChartTypeSettings.module.css";

export type ChartTypeSettingsProps = {
  sensibleVisualizations: ChartTypeListProps["visualizationList"];
  nonSensibleVisualizations: ChartTypeListProps["visualizationList"];
  customVizPlugins?: CustomVizPluginRuntime[];
  onSelectCustomVizPlugin?: (plugin: CustomVizPluginRuntime) => void;
} & Pick<
  ChartTypeListProps,
  "selectedVisualization" | "onSelectVisualization" | "onOpenSettings"
> &
  StackProps;

function CustomVizOption({
  plugin,
  onSelect,
}: {
  plugin: CustomVizPluginRuntime;
  onSelect: (plugin: CustomVizPluginRuntime) => void;
}) {
  const rawIcon = plugin.icon;
  const isAssetIcon = rawIcon != null && rawIcon.includes("/");
  const iconName: IconName = isAssetIcon
    ? "area"
    : ((rawIcon as IconName) ?? "area");
  const iconUrl = isAssetIcon
    ? `/api/custom-viz-plugin/${plugin.id}/asset?path=${encodeURIComponent(rawIcon)}`
    : undefined;

  return (
    <Center data-testid="chart-type-option">
      <Stack align="center" gap="xs" role="option" aria-selected={false}>
        <ActionIcon
          w="3.125rem"
          h="3.125rem"
          radius="xl"
          onClick={() => onSelect(plugin)}
          color="brand"
          variant="outline"
          className={cx(
            ChartTypeOptionS.BorderedButton,
            ChartTypeOptionS.VisualizationButton,
          )}
        >
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={plugin.display_name}
              width={20}
              height={20}
            />
          ) : (
            <Icon name={iconName} c="brand" size={20} />
          )}
        </ActionIcon>
        <Text lh="unset" ta="center" fw="bold" fz="sm" c="text-secondary">
          {plugin.display_name}
        </Text>
        {plugin.dev_bundle_url && (
          <Text lh="unset" ta="center" fz="xs" c="text-tertiary">
            {t`dev`}
          </Text>
        )}
      </Stack>
    </Center>
  );
}

export const ChartTypeSettings = ({
  selectedVisualization,
  onSelectVisualization,
  sensibleVisualizations,
  nonSensibleVisualizations,
  customVizPlugins,
  onSelectCustomVizPlugin,
  onOpenSettings,
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

      {customVizPlugins &&
        customVizPlugins.length > 0 &&
        onSelectCustomVizPlugin && (
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
              initialState="collapsed"
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
                  {customVizPlugins.map((plugin) => (
                    <Grid.Col
                      span={3}
                      key={plugin.id}
                      data-testid="chart-type-list-col"
                    >
                      <CustomVizOption
                        plugin={plugin}
                        onSelect={onSelectCustomVizPlugin}
                      />
                    </Grid.Col>
                  ))}
                </Grid>
              </>
            </CollapseSection>
          </>
        )}
    </Stack>
  );
};
