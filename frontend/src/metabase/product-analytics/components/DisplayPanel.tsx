import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Box, Group, Paper, Text, Title } from "metabase/ui";
import {
  BaseChartSettings,
  useChartSettingsState,
  useSettingsWidgets,
} from "metabase/visualizations/components/ChartSettings";
import { ChartSettingColorPicker } from "metabase/visualizations/components/settings/ChartSettingColorPicker";
import type { Widget } from "metabase/viz-core";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";

import type { ColorSlot } from "../analyses/types";

import S from "./DisplayPanel.module.css";
import { PanelCloseButton } from "./PanelCloseButton";
import { ResizeHandle } from "./ResizeHandle";

const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 360;

type DisplayPanelProps = {
  /** The chart's series, null until there's a result. */
  series: RawSeries | null;
  /** The settings the analysis picks, before the user's display changes. */
  baseSettings: VisualizationSettings;
  /** Only the settings that differ from `baseSettings`. */
  onChange: (overrides: VisualizationSettings) => void;
  /** The colors the analysis lets the user pick, shown before the rest. */
  colorSlots: ColorSlot[];
  onChangeColor: (key: string, color: string) => void;
  onClose: () => void;
};

/**
 * Right of the chart: the chart's own "Display" settings, as in the query
 * builder's chart settings sidebar. The analysis owns the data settings, so
 * the other sections aren't offered.
 */
export const DisplayPanel = ({
  series,
  baseSettings,
  onChange,
  colorSlots,
  onChangeColor,
  onClose,
}: DisplayPanelProps) => {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  return (
    <Paper withBorder radius="md" className={S.root} w={width} mr="lg">
      <ResizeHandle
        className={S.handle}
        edge="left"
        getSize={() => width}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        onResize={setWidth}
      />
      <Group justify="space-between" wrap="nowrap" px="xl" pt="lg">
        <Title order={5}>{t`Chart settings`}</Title>
        <PanelCloseButton onClose={onClose} />
      </Group>
      <Box className={S.body}>
        {series !== null ? (
          <DisplaySettings
            series={series}
            baseSettings={baseSettings}
            onChange={onChange}
            colorSlots={colorSlots}
            onChangeColor={onChangeColor}
          />
        ) : (
          <Text c="text-secondary" px="xl" pt="xl">
            {t`Display options appear once the chart has results.`}
          </Text>
        )}
      </Box>
    </Paper>
  );
};

type DisplaySettingsProps = Omit<DisplayPanelProps, "series" | "onClose"> & {
  series: RawSeries;
};

const DisplaySettings = ({
  series,
  baseSettings,
  onChange,
  colorSlots,
  onChangeColor,
}: DisplaySettingsProps) => {
  // Keep only what the user changed, so the analysis can still update the
  // rest, e.g. its columns when the settings change.
  const handleChange = (settings: VisualizationSettings) =>
    onChange(
      _.pick(settings, (value, key) => !_.isEqual(value, baseSettings[key])),
    );
  const { chartSettings, handleChangeSettings, transformedSeries } =
    useChartSettingsState({ series, onChange: handleChange });
  const widgets = useSettingsWidgets({
    series,
    transformedSeries,
    handleChangeSettings,
  });
  const displayWidgets = useMemo((): Widget[] => {
    // Shaped like the chart's own widgets, so they list and look the same.
    const colorWidgets = colorSlots.map((slot) => ({
      id: `color.${slot.key}`,
      section: t`Display`,
      title: slot.label,
      widget: ChartSettingColorPicker,
      value: slot.color,
      inline: true,
      onChange: (value?: unknown) => {
        if (typeof value === "string") {
          onChangeColor(slot.key, value);
        }
      },
    }));
    return [
      ...colorWidgets,
      ...widgets.filter((widget) => widget.section === t`Display`),
    ];
  }, [colorSlots, onChangeColor, widgets]);

  if (displayWidgets.every((widget) => widget.hidden)) {
    return (
      <Text c="text-secondary" px="xl" pt="xl">
        {t`This chart has no display options.`}
      </Text>
    );
  }
  return (
    <BaseChartSettings
      series={series}
      onChange={handleChange}
      chartSettings={chartSettings}
      transformedSeries={transformedSeries}
      widgets={displayWidgets}
      flex={1}
      mih={0}
    />
  );
};
