import { t } from "ttag";

import { Box, Flex, Icon, Paper, Stack, Text, Title } from "metabase/ui";

import type { PreviewPrincipal } from "../api";

import { PrincipalHeader } from "./PrincipalHeader";

type DoesNotApplyProps = {
  principal: PreviewPrincipal;
  reason: string | null;
};

/** A tab that can't apply to who is previewed says why, instead of showing a grid of "No". */
export function DoesNotApply({ principal, reason }: DoesNotApplyProps) {
  return (
    <Box px="xxl" pt="xl" flex={1}>
      <PrincipalHeader principal={principal} />
      <Paper withBorder p="lg" maw="40rem">
        <Flex gap="md" align="flex-start">
          <Icon name="close" size={20} c="feedback-negative" mt="xs" />
          <Stack gap="xs">
            <Title order={4}>{t`This tab doesn't apply to tenant users`}</Title>
            {reason && <Text>{reason}</Text>}
          </Stack>
        </Flex>
      </Paper>
    </Box>
  );
}
