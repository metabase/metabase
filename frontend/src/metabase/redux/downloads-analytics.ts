import { trackSchemaEvent } from "metabase/lib/analytics";

import type { ResourceAccessedVia, ResourceType } from "./downloads-types";

const SCHEMA = "downloads";

export const trackDownloadResults = ({
  resourceType,
  accessedVia,
  exportType,
}: {
  resourceType: ResourceType;
  accessedVia: ResourceAccessedVia;
  exportType: string;
}) => {
  // Map document-card to dashcard for analytics tracking since the schema
  // doesn't have a separate document-card type
  const analyticsResourceType =
    resourceType === "document-card" ? "dashcard" : resourceType;

  trackSchemaEvent(SCHEMA, {
    event: "download_results_clicked",
    resource_type: analyticsResourceType,
    accessed_via: accessedVia,
    export_type: exportType as any,
  });
};
