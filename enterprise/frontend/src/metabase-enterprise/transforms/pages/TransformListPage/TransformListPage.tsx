import { t } from "ttag";

import { Flex, Stack, Text, Title } from "metabase/ui";

import { ScheduleSection } from "./ScheduleSection";
import { TransformListSection } from "./TransformListSection";

export function TransformListPage() {
  return (
    <Flex direction="column" align="center">
      <Stack gap="3.5rem">
        <Stack gap="sm">
          <Title order={1}>{t`Transforms overview`}</Title>
          <Text>{t`Create custom tables with transforms, and run them on a schedule.`}</Text>
        </Stack>
        <ScheduleSection />
        <TransformListSection />
      </Stack>
    </Flex>
  );
}
