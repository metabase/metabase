import { t } from "ttag";

import { CopyTextArea } from "metabase/common/components/CopyTextArea";
import { Stack, Text, Title } from "metabase/ui";

// metabase/agent-skills keeps one folder per breaking version of the skill, at
// `skills/metabase-data-apps/<version>`. The skill is marked internal, so the
// install also names it.
const INSTALL_SKILL_COMMAND =
  "npx skills add metabase/agent-skills/skills/metabase-data-apps/v1 \\\n  --skill metabase-data-apps";

export const DataAppSkillsSection = () => (
  <Stack gap="sm">
    <Title order={3}>{t`AI skills`}</Title>

    {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin UI string */}
    <Text>{t`Install the Metabase Data Apps skill in your project, then ask your AI agent to create a data app.`}</Text>

    <CopyTextArea
      value={INSTALL_SKILL_COMMAND}
      aria-label={t`Install command`}
      autosize
      // `ff` styles the field's wrapper, not the textarea that holds the text.
      styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
    />
  </Stack>
);
