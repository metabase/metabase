import { t } from "ttag";

import { Alert, Icon } from "metabase/ui";
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
      size="compact"
      color="error"
      icon={<Icon name="warning" />}
      data-testid="disconnected-database-banner"
    >
      {t`The database this transform depends on has been disconnected. The transform can't be edited or run.`}
    </Alert>
  );
};
