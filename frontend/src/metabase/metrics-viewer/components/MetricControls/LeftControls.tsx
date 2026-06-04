import cx from "classnames";
import { t } from "ttag";

import { trackStackedSeriesEnabled } from "metabase/metrics-viewer/analytics";
import type { MetricsViewerDisplayType } from "metabase/metrics-viewer/types";
import type { ChartTypeOption } from "metabase/metrics-viewer/utils";
import { ActionIcon, Box, Flex, Icon, Menu } from "metabase/ui";

import { ChartLayoutPicker } from "./ChartLayoutPicker";
import { ChartTypePicker } from "./ChartTypePicker";
import S from "./MetricControls.module.css";

type LeftControlsProps = {
  chartTypes: ChartTypeOption[];
  value: MetricsViewerDisplayType;
  showStackSeries?: boolean;
  isStacked: boolean;
  onDisplayTypeChange: (displayType: MetricsViewerDisplayType) => void;
  onStackedChange: (stacked: boolean) => void;
};

function getDisplayTypeLabel(type: MetricsViewerDisplayType) {
  switch (type) {
    case "line":
      return t`Line chart`;
    case "area":
      return t`Area chart`;
    case "bar":
      return t`Bar chart`;
    case "map":
      return t`Map`;
    case "scatter":
      return t`Scatter plot`;
    case "scalar":
      return t`Scalar`;
    default:
      return type;
  }
}

export function LeftControls({
  chartTypes,
  value,
  showStackSeries,
  isStacked,
  onDisplayTypeChange,
  onStackedChange,
}: LeftControlsProps) {
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
          onChange={onDisplayTypeChange}
        />
        {showStackSeries && (
          <ChartLayoutPicker
            isStacked={isStacked}
            onToggle={(stacked) => onStackedChange(stacked)}
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
                onClick={() => onDisplayTypeChange(type)}
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
                  onClick={() => onStackedChange(false)}
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
                    onStackedChange(true);
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
