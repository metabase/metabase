import { t } from "ttag";

import { useSetting } from "metabase/settings";
import { Stack, Text, Textarea } from "metabase/ui";

const SEND_PROMPT_MAX_LENGTH = 500;

type Props = {
  sendPrompt: string | null | undefined;
  onChange: (sendPrompt: string | null) => void;
};

export const AlertMetabotSendGate = ({ sendPrompt, onChange }: Props) => {
  const isMetabotEnabled = useSetting("metabot-enabled?");
  const metabotName = useSetting("metabot-name");

  if (!isMetabotEnabled) {
    return null;
  }

  return (
    <Stack gap="xs" mt="lg">
      <Text fw="bold" size="md">
        {t`And only send it if ${metabotName} agrees`}
      </Text>
      <Textarea
        data-testid="alert-metabot-send-gate"
        value={sendPrompt ?? ""}
        maxLength={SEND_PROMPT_MAX_LENGTH}
        minRows={2}
        autosize
        placeholder={t`For example: only if the drop is over 10% and isn't a weekend dip`}
        // an empty box means no gate at all; only the emptiness check is trimmed, so spaces
        // stay typeable
        onChange={(event) => {
          const value = event.target.value;
          onChange(value.trim() === "" ? null : value);
        }}
      />
      <Text size="sm" c="text-secondary">
        {t`Describe when you do want it sent. Checked only after the condition above fires, and if ${metabotName} is unavailable or unsure the alert still sends.`}
      </Text>
    </Stack>
  );
};
