import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Paper, Text, Title } from "metabase/ui";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";

import type { SettingWidget } from "../settings/types";
import type { AnalysisPanel } from "../use-analysis-state";

// ChartSettingsWidget insets itself for the chart settings sidebar; the Paper
// already provides padding here.
const WIDGET_STYLE = { marginInline: 0 };

type SettingsPanelProps = {
  panel: AnalysisPanel;
  widgets: SettingWidget[];
};

export const SettingsPanel = ({ panel, widgets }: SettingsPanelProps) => {
  const visible = widgets.filter(
    (widget) => widget.section === panel && !widget.hidden,
  );
  const ungrouped = visible.filter((widget) => widget.group === undefined);
  const columns = visible.filter((widget) => widget.group === "columns");

  return (
    <Paper
      withBorder
      pt="xl"
      px="xl"
      w="25rem"
      mah="100%"
      className={cx(CS.alignSelfStart, CS.overflowYAuto)}
    >
      {ungrouped.map((widget) => (
        <ChartSettingsWidget key={widget.id} {...widget} style={WIDGET_STYLE} />
      ))}
      {columns.length > 0 && (
        <Box mt="md">
          <Title order={5} mb="xs">{t`Columns`}</Title>
          <Text c="text-secondary" size="sm" mb="lg">
            {t`Which columns hold the event time, the person, and so on.`}
          </Text>
          {columns.map((widget) => (
            <ChartSettingsWidget
              key={widget.id}
              {...widget}
              style={WIDGET_STYLE}
            />
          ))}
        </Box>
      )}
    </Paper>
  );
};
