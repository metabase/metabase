import { t } from "ttag";

import { Alert, Icon, Text } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { isMissingSourceDatabase } from "../utils";

export const TransformDisconnectedDatabaseBanner = ({
  transform,
}: {
  transform: Transform;
}) => {
  if (!isMissingSourceDatabase(transform)) {
    return null;
  }

  return (
    <Alert
      color="error"
      icon={<Icon name="warning" />}
      data-testid="disconnected-database-banner"
    >
      <Text>{t`The database this transform depends on has been disconnected. The transform can't be edited or run.`}</Text>
    </Alert>
  );
};
