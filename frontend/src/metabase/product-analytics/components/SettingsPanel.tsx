import { t } from "ttag";

import { Paper, Text, Title } from "metabase/ui";

import type { AnalysisPanel } from "../use-analysis-state";

type SettingsPanelProps = {
  panel: AnalysisPanel;
};

export const SettingsPanel = ({ panel }: SettingsPanelProps) => {
  const title = panel === "setup" ? t`Setup` : t`Advanced settings`;

  return (
    <Paper withBorder p="lg" miw={280} maw={360} w="100%">
      <Title order={4}>{title}</Title>
      <Text c="text-secondary" mt="sm">
        {t`Coming soon.`}
      </Text>
    </Paper>
  );
};
