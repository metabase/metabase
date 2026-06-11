import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import { trackStackedSeriesEnabled } from "metabase/metrics-viewer/analytics";
import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import type { MetricsViewerDisplayType } from "metabase/metrics-viewer/types";
import { getDimensionBreakoutConfig } from "metabase/metrics-viewer/utils";
import { ActionIcon, Box, Flex, Icon, Menu } from "metabase/ui";

import { ChartLayoutPicker } from "./ChartLayoutPicker";
import { ChartTypePicker } from "./ChartTypePicker";
import S from "./LeftControls.module.css";
import {
  getDisplayTypeLabel,
  isValidDisplayTypeForDimensionBreakout,
} from "./utils";

type LeftControlsProps = {
  showStackSeries?: boolean;
};

export function LeftControls({ showStackSeries }: LeftControlsProps) {
  const {
    activeDimensionBreakout: dimensionBreakout,
    updateActiveDimensionBreakout,
  } = useMetricsViewerContext();

  const handleDisplayTypeChange = useCallback(
    (display: MetricsViewerDisplayType) => {
      updateActiveDimensionBreakout((prev) => ({ ...prev, display }));
    },
    [updateActiveDimensionBreakout],
  );

  const handleSplitChannelsChange = useCallback(
    (splitChannels: boolean) => {
      updateActiveDimensionBreakout((prev) => ({
        ...prev,
        visualizationSettings: {
          ...prev.visualizationSettings,
          "graph.split_panels": splitChannels,
        },
      }));
    },
    [updateActiveDimensionBreakout],
  );

  if (!dimensionBreakout || dimensionBreakout.type === "scalar") {
    return null;
  }

  const config = getDimensionBreakoutConfig(dimensionBreakout.type);
  const chartTypes = config.availableDisplayTypes;
  const value = isValidDisplayTypeForDimensionBreakout(
    dimensionBreakout.display,
    dimensionBreakout.type,
  )
    ? dimensionBreakout.display
    : config.defaultDisplayType;
  const isStacked =
    !!dimensionBreakout.visualizationSettings?.["graph.split_panels"];
  const selectedChartType = chartTypes.find(({ type }) => type === value);

  return (
    <>
      <Flex
        className={cx(S.leftControls, S.leftControlsFull)}
        align="center"
        gap="md"
      >
        <ChartTypePicker
          chartTypes={chartTypes}
          value={value}
          onChange={handleDisplayTypeChange}
        />
        {showStackSeries && (
          <ChartLayoutPicker
            isStacked={isStacked}
            onToggle={handleSplitChannelsChange}
          />
        )}
      </Flex>
      <Box className={cx(S.leftControls, S.leftControlsCompact)}>
        <Menu position="top-start" withinPortal>
          <Menu.Target>
            <ActionIcon
              className={S.compactChartTypeButton}
              aria-label={t`Change visualization type`}
              variant="subtle"
              data-testid="metrics-viewer-compact-chart-controls"
            >
              {selectedChartType && (
                <Icon name={selectedChartType.icon} c="text-primary" />
              )}
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown className={S.compactChartMenuDropdown} p="sm">
            <Menu.Label c="text-secondary" pt="sm" mb="xs">
              {t`Visualization`}
            </Menu.Label>
            {chartTypes.map(({ type, icon }) => (
              <Menu.Item
                key={type}
                className={cx(S.compactChartMenuItem, {
                  [S.compactChartMenuItemSelected]: value === type,
                })}
                leftSection={
                  <Icon
                    aria-hidden
                    name={icon}
                    c={value === type ? "brand" : "text-primary"}
                  />
                }
                onClick={() => handleDisplayTypeChange(type)}
              >
                {getDisplayTypeLabel(type)}
              </Menu.Item>
            ))}
            {showStackSeries && (
              <>
                <Menu.Divider mx={0} />
                <Menu.Label c="text-secondary" pt="sm" mb="xs">
                  {t`Layout`}
                </Menu.Label>
                <Menu.Item
                  className={cx(S.compactChartMenuItem, {
                    [S.compactChartMenuItemSelected]: !isStacked,
                  })}
                  leftSection={
                    <Icon
                      aria-hidden
                      name="chart_layout_default"
                      c={!isStacked ? "brand" : "text-primary"}
                    />
                  }
                  onClick={() => handleSplitChannelsChange(false)}
                >
                  {t`Default`}
                </Menu.Item>
                <Menu.Item
                  className={cx(S.compactChartMenuItem, {
                    [S.compactChartMenuItemSelected]: isStacked,
                  })}
                  leftSection={
                    <Icon
                      aria-hidden
                      name="chart_layout_stack"
                      c={isStacked ? "brand" : "text-primary"}
                    />
                  }
                  onClick={() => {
                    handleSplitChannelsChange(true);
                    trackStackedSeriesEnabled();
                  }}
                >
                  {t`Stacked`}
                </Menu.Item>
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </Box>
    </>
  );
}
