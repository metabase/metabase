import { t } from "ttag";

import { Button, Group, Stack, Text, Textarea } from "metabase/ui";
import type { DraftDashboardSubscription } from "metabase-types/api";

interface MetabotPromptSectionProps {
  pulse: DraftDashboardSubscription;
  setPulse: (pulse: DraftDashboardSubscription) => void;
}

const PRESETS = () => [
  {
    label: t`Summary`,
    prompt: t`Summarize the dashboard in a few sentences. Lead with the biggest change since the previous report and include the chart that shows it.`,
  },
  {
    label: t`Changes only`,
    prompt: t`Only report metrics that moved noticeably since the previous report, with the likely driver for each. Skip anything flat.`,
  },
  {
    label: t`Anomalies`,
    prompt: t`Look for anomalies: values far outside their recent trend. If there are none, say so in one line and attach nothing.`,
  },
];

/** Optional Metabot instruction: when set, Metabot compiles the report instead of sending every card. */
export const MetabotPromptSection = ({
  pulse,
  setPulse,
}: MetabotPromptSectionProps) => {
  const value = pulse.metabot_prompt ?? "";
  const setPrompt = (prompt: string) =>
    setPulse({
      ...pulse,
      metabot_prompt: prompt.trim() === "" ? null : prompt,
    });

  return (
    <Stack gap="sm">
      <Textarea
        label={<Text fw="bold">{t`Ask Metabot to compile this report`}</Text>}
        description={t`Leave empty to send every card as usual. With a prompt, Metabot reads the results, checks trends, and sends its write-up plus the charts it picks.`}
        placeholder={t`e.g. Summarize what changed since last week and why`}
        value={value}
        onChange={(e) => setPrompt(e.target.value)}
        autosize
        minRows={3}
        maxRows={8}
      />
      <Group gap="xs">
        {PRESETS().map(({ label, prompt }) => (
          <Button
            key={label}
            size="xs"
            variant="subtle"
            onClick={() => setPrompt(prompt)}
          >
            {label}
          </Button>
        ))}
      </Group>
    </Stack>
  );
};
