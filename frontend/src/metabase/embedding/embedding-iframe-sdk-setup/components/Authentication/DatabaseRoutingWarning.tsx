import { useMemo } from "react";
import { t } from "ttag";

import {
  dashboardUsesRoutingEnabledDatabases,
  questionUsesRoutingEnabledDatabase,
} from "metabase/admin/databases/utils";
import { useListDatabasesQuery } from "metabase/api";
import type {
  EmbedResource,
  GuestEmbedResourceType,
} from "metabase/public/lib/types";
import { Alert, Icon } from "metabase/ui";
import type { Card, Dashboard } from "metabase-types/api";

interface DatabaseRoutingWarningProps {
  resource: EmbedResource;
  resourceType: GuestEmbedResourceType;
}

export const DatabaseRoutingWarning = ({
  resource,
  resourceType,
}: DatabaseRoutingWarningProps) => {
  const { data: databasesResponse } = useListDatabasesQuery();

  // Check if this resource uses databases with routing enabled
  const usesRoutingEnabledDatabase = useMemo(() => {
    const databases = databasesResponse?.data || [];

    if (resourceType === "question") {
      return questionUsesRoutingEnabledDatabase(resource as Card, databases);
    }

    if (resourceType === "dashboard") {
      return dashboardUsesRoutingEnabledDatabases(
        resource as Dashboard,
        databases,
      );
    }

    return false;
  }, [resource, resourceType, databasesResponse]);

  if (!usesRoutingEnabledDatabase) {
    return null;
  }

  return (
    <Alert
      variant="light"
      color="warning"
      icon={<Icon name="warning" />}
      title={t`Database routing active`}
      mb="md"
    >
      {resourceType === "dashboard"
        ? t`One or more questions in this dashboard are querying a database with database routing enabled. The corresponding database queries will be executed against the router database.`
        : t`This question is querying a database with database routing enabled. The database queries will be executed against the router database.`}
    </Alert>
  );
};
