import { t } from "ttag";

import { MetabotIcon } from "metabase/metabot/components/MetabotIcon";
import { Box, Group, Stack, Text } from "metabase/ui";

import S from "./MetabotDigestLoader.module.css";

/**
 * The digest runs a warehouse query per eligible item, so this sits on screen for seconds. Long enough that a
 * bare spinner reads as a stall — a character reads as work happening.
 */
export const MetabotDigestLoader = ({ message }: { message?: string }) => (
  <Stack align="center" gap="lg" py="6rem">
    <Box pos="relative" w="4rem" h="4rem">
      <Box className={S.orbit}>
        <Box className={S.spark} />
        <Box className={S.spark} />
      </Box>
      <Group justify="center" align="center" w="100%" h="100%">
        <MetabotIcon size={40} className={S.bot} />
      </Group>
    </Box>

    <Stack align="center" gap="sm">
      <Text c="text-secondary">{message ?? t`Building your digest…`}</Text>
      <Group gap="xs">
        <Box className={S.dot} />
        <Box className={S.dot} />
        <Box className={S.dot} />
      </Group>
    </Stack>
  </Stack>
);
