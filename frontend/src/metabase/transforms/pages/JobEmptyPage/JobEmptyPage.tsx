import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Center } from "metabase/ui";

export function JobEmptyPage() {
  return (
    <Center h="100%" bg="background-secondary">
      <EmptyState
        illustrationElement={<img src={EmptyDashboardBot} />}
        title={t`Pick a job or create a new one`}
        message={t`Jobs let you run groups of transforms on a schedule.`}
      />
    </Center>
  );
}
