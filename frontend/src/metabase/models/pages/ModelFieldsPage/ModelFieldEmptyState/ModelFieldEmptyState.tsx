import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import EmptyState from "metabase/common/components/EmptyState";
import { Center } from "metabase/ui";

export function ModelFieldEmptyState() {
  return (
    <Center flex={1} h="100%">
      <EmptyState
        illustrationElement={<img src={EmptyDashboardBot} />}
        title={t`Edit the fields`}
        message={t`Select a field to edit its name, description, formatting, and more.`}
      />
    </Center>
  );
}
