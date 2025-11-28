import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import EmptyState from "metabase/common/components/EmptyState";
import { Center } from "metabase/ui";

export function ModelingEmptyPage() {
  return (
    <Center h="100%" bg="bg-light" data-testid="modeling-empty-page">
      <EmptyState
        illustrationElement={<img src={EmptyDashboardBot} />}
        title={t`Pick a collection or create a new model or metric`}
        message={t`Build your semantic layer with models and metrics.`}
      />
    </Center>
  );
}
