import { t } from "ttag";

import { Flex, Stack, Text, Title } from "metabase/ui";

import { CreateSection } from "./CreateSection";
import { ScheduleSection } from "./ScheduleSection";

export function OverviewPage() {
  return (
    <Flex direction="column" align="center">
      <Stack gap="3.5rem">
        <Stack gap="sm">
          <Title order={1}>{t`Transforms overview`}</Title>
          <Text>{t`Create custom views and tables with transforms, and run them on a schedule.`}</Text>
        </Stack>
        <CreateSection />
        <ScheduleSection />
      </Stack>
    </Flex>
  );
}
