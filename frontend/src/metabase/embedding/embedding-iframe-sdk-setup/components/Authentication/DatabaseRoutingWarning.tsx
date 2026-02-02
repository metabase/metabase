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
  const databases = databasesResponse?.data || [];

  // Check if this resource uses databases with routing enabled
  const usesRoutingEnabledDatabase = (() => {
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
  })();

  if (!usesRoutingEnabledDatabase) {
    return null;
  }

  const getWarningMessage = () => {
    if (resourceType === "dashboard") {
      return "One or more questions in this dashboard are querying a database with database routing enabled. The corresponding database queries will be executed against the router database.";
    }
    return "This question is querying a database with database routing enabled. The database queries will be executed against the router database.";
  };

  return (
    <Alert
      variant="light"
      color="warning"
      icon={<Icon name="warning" />}
      mb="md"
    >
      {getWarningMessage()}
    </Alert>
  );
};
