import { t } from "ttag";

import EmptyCodeResult from "assets/img/empty-states/code.svg";
import { fetchCardData } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/redux";
import { Box, Button, Flex, Stack, Text } from "metabase/ui";
import type { QuestionDashboardCard } from "metabase-types/api";

export function RunNativeDashcardView({
  dashcard,
}: {
  dashcard: QuestionDashboardCard;
}) {
  const dispatch = useDispatch();
  const run = () => dispatch(fetchCardData(dashcard.card, dashcard));

  return (
    <Flex
      w="100%"
      h="100%"
      align="center"
      justify="center"
      data-testid="run-native-dashcard"
    >
      <Stack maw="25rem" gap="sm" ta="center" align="center">
        <Box maw="3rem">
          <img src={EmptyCodeResult} alt="" />
        </Box>
        <Text c="text-secondary">{t`Here's where your results will appear`}</Text>
        <Button variant="filled" size="compact-md" onClick={run}>
          {t`Run query`}
        </Button>
      </Stack>
    </Flex>
  );
}
