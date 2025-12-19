import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import EmptyState from "metabase/common/components/EmptyState";
import { Center } from "metabase/ui";

export function TransformEmptyPage() {
  return (
    <Center h="100%" bg="background-secondary">
      <EmptyState
        illustrationElement={<img src={EmptyDashboardBot} />}
        title={t`Pick a transform or create a new one`}
        message={t`Create custom tables with transforms, and run them on a schedule.`}
      />
    </Center>
  );
}
