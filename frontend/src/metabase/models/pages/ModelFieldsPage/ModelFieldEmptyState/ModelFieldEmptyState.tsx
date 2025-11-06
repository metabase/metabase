import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import EmptyState from "metabase/common/components/EmptyState";
import { Center } from "metabase/ui";

type ModelFieldEmptyStateProps = {
  isReadOnly: boolean;
};

export function ModelFieldEmptyState({
  isReadOnly,
}: ModelFieldEmptyStateProps) {
  return (
    <Center flex={1} h="100%">
      <EmptyState
        illustrationElement={<img src={EmptyDashboardBot} />}
        title={isReadOnly ? `View the fields` : t`Edit the fields`}
        message={
          isReadOnly
            ? t`Select a field to view its name and data type.`
            : t`Select a field to edit its name, description, formatting, and more.`
        }
      />
    </Center>
  );
}
