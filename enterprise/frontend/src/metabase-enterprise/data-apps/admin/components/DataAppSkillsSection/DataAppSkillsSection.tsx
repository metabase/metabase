import { t } from "ttag";

import { CopyTextArea } from "metabase/common/components/CopyTextArea";
import { Stack, Text, Title } from "metabase/ui";

import { INSTALL_SKILL_COMMAND } from "../../../constants";

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
