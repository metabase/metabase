import { t } from "ttag";

import { Icon, Stack, Text, Title } from "metabase/ui";

import S from "./ResearchModeIntro.module.css";

export function ResearchModeIntro() {
  return (
    <Stack align="center" gap="md" maw="24.125rem" mx="auto" ta="center">
      <Stack align="center" gap={0}>
        <Icon name="ai" size={16} className={S.aiIcon} right={-32} />
        <Icon name="telescope" size={48} className={S.illustration} />
      </Stack>
      <Title order={3} fw="bold">
        {t`What do you want to research?`}
      </Title>
      <Text c="text-secondary" lh="1.25rem">
        {t`Research mode helps automate running and inspecting combinations of metrics, dimensions, and timelines so you can use your brain for analysis, not busy work.`}
      </Text>
    </Stack>
  );
}
