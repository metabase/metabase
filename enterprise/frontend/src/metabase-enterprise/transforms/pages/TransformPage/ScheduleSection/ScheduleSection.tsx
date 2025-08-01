import { t } from "ttag";

import { Button, Divider, Group, SegmentedControl } from "metabase/ui";
import { CardSection } from "metabase-enterprise/transforms/components/CardSection";
import type { Transform } from "metabase-types/api";

type ScheduleSectionProps = {
  transform: Transform;
};

export function ScheduleSection({ transform }: ScheduleSectionProps) {
  return (
    <CardSection
      label={t`When to run this transform`}
      description={t`It can either be run on the schedule you set on the overview page, or only when you click the “run now” button.`}
    >
      <Group p="lg">
        <SegmentedControl
          value={transform.execution_trigger}
          data={getTriggerOptions()}
        />
      </Group>
      <Divider />
      <Group p="lg" justify="end">
        <Button>{t`Run now`}</Button>
      </Group>
    </CardSection>
  );
}

function getTriggerOptions() {
  return [
    { value: "global-schedule" as const, label: t`On the schedule` },
    { value: "none" as const, label: t`Manually only` },
  ];
}
