import { trackSchemaEvent } from "metabase/lib/analytics";

import type { DownloadedResourceType } from "./downloading";

const SCHEMA_VERSION = "1-0-0";
const SCHEMA = "downloads";

export const trackDownloadResults = ({
  resourceType,
  exportType,
}: {
  resourceType: DownloadedResourceType;
  exportType: string;
}) => {
  trackSchemaEvent(SCHEMA, SCHEMA_VERSION, {
    event: "download_results_clicked",
    resource_type: resourceType,
    export_type: exportType,
  });
};
