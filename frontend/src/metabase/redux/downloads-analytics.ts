import { trackSchemaEvent } from "metabase/lib/analytics";

import type { ResourceAccessedVia, ResourceType } from "./downloads";

const SCHEMA_VERSION = "1-0-0";
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
  trackSchemaEvent(SCHEMA, SCHEMA_VERSION, {
    event: "download_results_clicked",
    resource_type: resourceType,
    accessed_via: accessedVia,
    export_type: exportType,
  });
};
