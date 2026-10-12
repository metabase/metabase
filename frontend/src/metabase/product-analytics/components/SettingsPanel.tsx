import { t } from "ttag";

import { Box, Paper, Text, Title } from "metabase/ui";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";

import type { SettingWidget } from "../settings/types";
import type { AnalysisPanel } from "../use-analysis-state";

type SettingsPanelProps = {
  panel: AnalysisPanel;
  widgets: SettingWidget[];
};

export const SettingsPanel = ({ panel, widgets }: SettingsPanelProps) => {
  const title = panel === "setup" ? t`Setup` : t`Advanced settings`;
  const visible = widgets.filter(
    (widget) => widget.section === panel && !widget.hidden,
  );
  const ungrouped = visible.filter((widget) => widget.group === undefined);
  const columns = visible.filter((widget) => widget.group === "columns");

  return (
    <Paper withBorder p="lg" miw={280} maw={360} w="100%">
      <Title order={4} mb="lg">
        {title}
      </Title>
      {ungrouped.map((widget) => (
        <ChartSettingsWidget key={widget.id} {...widget} />
      ))}
      {columns.length > 0 && (
        <Box mt="md">
          <Title order={5} mb="xs">{t`Columns`}</Title>
          <Text c="text-secondary" size="sm" mb="lg">
            {t`Which columns hold the event time, the person, and so on.`}
          </Text>
          {columns.map((widget) => (
            <ChartSettingsWidget key={widget.id} {...widget} />
          ))}
        </Box>
      )}
    </Paper>
  );
};
