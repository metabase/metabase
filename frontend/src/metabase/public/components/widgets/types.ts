import type { Card, Dashboard } from "metabase-types/api";
import type { exportFormats } from "metabase/lib/urls";

export type Resource = Dashboard | Card;
export type EmbedResource =
  | {
      resource: Dashboard;
      resourceType: "dashboard";
    }
  | {
      resource: Card;
      resourceType: "question";
    };
export type EmbedModalStep = "application" | null;
export type ExportFormatType = typeof exportFormats[number] | null;
