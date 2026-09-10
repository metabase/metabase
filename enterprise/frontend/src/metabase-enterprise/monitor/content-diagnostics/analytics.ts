import { trackSimpleEvent } from "metabase/analytics";
import type {
  ContentDiagnosticsEntityType,
  ContentDiagnosticsFindingType,
} from "metabase-types/api";

import type { ContentDiagnosticsFilterDimension } from "./components/types";

export const trackContentDiagnosticsTabViewed = (
  tab: ContentDiagnosticsFindingType,
) => {
  trackSimpleEvent({
    event: "content_diagnostics_tab_viewed",
    event_detail: tab,
  });
};

export const trackContentDiagnosticsFindingSelected = ({
  tab,
  entityId,
  entityType,
}: {
  tab: ContentDiagnosticsFindingType;
  entityId: number;
  entityType: ContentDiagnosticsEntityType;
}) => {
  trackSimpleEvent({
    event: "content_diagnostics_finding_selected",
    triggered_from: tab,
    target_id: entityId,
    event_detail: entityType,
  });
};

export const trackContentDiagnosticsEntityOpened = ({
  tab,
  entityId,
  entityType,
}: {
  tab: ContentDiagnosticsFindingType;
  entityId: number;
  entityType: ContentDiagnosticsEntityType;
}) => {
  trackSimpleEvent({
    event: "content_diagnostics_entity_opened",
    triggered_from: tab,
    target_id: entityId,
    event_detail: entityType,
  });
};

export const trackContentDiagnosticsFiltersChanged = ({
  tab,
  dimension,
}: {
  tab: ContentDiagnosticsFindingType;
  dimension: ContentDiagnosticsFilterDimension;
}) => {
  trackSimpleEvent({
    event: "content_diagnostics_filters_changed",
    triggered_from: tab,
    event_detail: dimension,
  });
};

export const trackContentDiagnosticsFiltersReset = (
  tab: ContentDiagnosticsFindingType,
) => {
  trackSimpleEvent({
    event: "content_diagnostics_filters_reset",
    triggered_from: tab,
  });
};

export const trackContentDiagnosticsFindingsBulkTrashed = ({
  tab,
  removedCount,
  selectedCount,
  durationMs,
  result,
}: {
  tab: ContentDiagnosticsFindingType;
  removedCount: number;
  selectedCount: number;
  durationMs: number;
  result: "success" | "partial" | "failure";
}) => {
  trackSimpleEvent({
    event: "content_diagnostics_findings_bulk_trashed",
    triggered_from: tab,
    event_detail: `${removedCount}/${selectedCount}`,
    duration_ms: durationMs,
    result,
  });
};
