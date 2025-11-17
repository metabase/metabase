import { t } from "ttag";

import { Icon, Stack, Text } from "metabase/ui";

import S from "./MetabotQuestion.module.css";

export const MetabotQuestionEmptyState = () => (
  <Stack h="100%" w="100%" gap="sm" align="center" justify="center">
    <Icon name="ai" c="text-tertiary" size="3rem" opacity={0.7} />

    <Stack gap="xs" align="center">
      <Text lh="sm">{t`Ask questions to AI.`}</Text>
      <Text lh="sm">{t`Results will appear here.`}</Text>
    </Stack>

    <Text
      className={S.emptyStateDisclaimerText}
      lh="sm"
      fz="sm"
      c="text-tertiary"
    >{t`AI isn't perfect. Double-check results.`}</Text>
  </Stack>
);
