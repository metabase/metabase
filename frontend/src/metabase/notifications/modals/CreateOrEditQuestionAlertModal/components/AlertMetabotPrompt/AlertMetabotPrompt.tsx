import { t } from "ttag";

import { useSetting } from "metabase/settings";
import { Checkbox, Stack, Text, Textarea } from "metabase/ui";

import { AlertModalSettingsBlock } from "../AlertModalSettingsBlock/AlertModalSettingsBlock";

const PROMPT_MAX_LENGTH = 500;

type Props = {
  prompt: string | null | undefined;
  generateTitle: boolean | undefined;
  onChange: (prompt: string | null) => void;
  onGenerateTitleChange: (generateTitle: boolean) => void;
};

export const AlertMetabotPrompt = ({
  prompt,
  generateTitle,
  onChange,
  onGenerateTitleChange,
}: Props) => {
  const isMetabotEnabled = useSetting("metabot-enabled?");
  const metabotName = useSetting("metabot-name");

  if (!isMetabotEnabled) {
    return null;
  }

  return (
    <AlertModalSettingsBlock
      title={t`Do you want ${metabotName} to interpret the results?`}
    >
      <Stack gap="xs">
        <Textarea
          data-testid="alert-metabot-prompt"
          value={prompt ?? ""}
          maxLength={PROMPT_MAX_LENGTH}
          minRows={2}
          autosize
          placeholder={t`For example: flag anything unusual compared to the past four weeks`}
          // an empty box means no prompt at all, which skips the LLM call entirely;
          // only the emptiness check is trimmed, so spaces stay typeable
          onChange={(event) => {
            const value = event.target.value;
            onChange(value.trim() === "" ? null : value);
          }}
        />
        <Text size="sm" c="text-secondary">
          {t`${metabotName} reads the results with your permissions and writes a short summary above the chart. Leave this empty to send the alert on its own.`}
        </Text>
        <Checkbox
          // the title comes out of the same Metabot call as the summary, so it needs a prompt
          disabled={!prompt}
          checked={Boolean(prompt) && Boolean(generateTitle)}
          label={t`Let ${metabotName} write the alert's title`}
          onChange={(event) => onGenerateTitleChange(event.target.checked)}
        />
      </Stack>
    </AlertModalSettingsBlock>
  );
};
