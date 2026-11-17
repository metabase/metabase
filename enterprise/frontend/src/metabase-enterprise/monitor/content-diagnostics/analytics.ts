import { trackSimpleEvent } from "metabase/analytics";
import type {
  CollectionId,
  ContentDiagnosticsEntityId,
  ContentDiagnosticsEntityType,
} from "metabase-types/api";

import type {
  ContentDiagnosticsFilterDimension,
  ContentDiagnosticsTab,
} from "./components/types";

export const trackContentDiagnosticsTabViewed = (
  tab: ContentDiagnosticsTab,
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
  tab: ContentDiagnosticsTab;
  entityId: ContentDiagnosticsEntityId;
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
  tab: ContentDiagnosticsTab;
  entityId: ContentDiagnosticsEntityId;
  entityType: ContentDiagnosticsEntityType;
}) => {
  trackSimpleEvent({
    event: "content_diagnostics_entity_opened",
    triggered_from: tab,
    target_id: entityId,
    event_detail: entityType,
  });
};

export const trackContentDiagnosticsDuplicateOpened = ({
  tab,
  entityId,
  entityType,
}: {
  tab: ContentDiagnosticsTab;
  entityId: ContentDiagnosticsEntityId;
  entityType: ContentDiagnosticsEntityType;
}) => {
  trackSimpleEvent({
    event: "content_diagnostics_duplicate_opened",
    triggered_from: tab,
    target_id: entityId,
    event_detail: entityType,
  });
};

export const trackContentDiagnosticsLocationOpened = (
  tab: ContentDiagnosticsTab,
  collectionId: CollectionId,
) => {
  trackSimpleEvent({
    event: "content_diagnostics_location_opened",
    triggered_from: tab,
    event_detail: String(collectionId),
  });
};

export const trackContentDiagnosticsFiltersChanged = ({
  tab,
  dimension,
}: {
  tab: ContentDiagnosticsTab;
  dimension: ContentDiagnosticsFilterDimension;
}) => {
  trackSimpleEvent({
    event: "content_diagnostics_filters_changed",
    triggered_from: tab,
    event_detail: dimension,
  });
};

export const trackContentDiagnosticsFiltersReset = (
  tab: ContentDiagnosticsTab,
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
  tab: ContentDiagnosticsTab;
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

export const trackContentDiagnosticsFindingsBulkDismissed = ({
  tab,
  dismissedCount,
  selectedCount,
  durationMs,
  result,
}: {
  tab: ContentDiagnosticsTab;
  dismissedCount: number;
  selectedCount: number;
  durationMs: number;
  result: "success" | "partial" | "failure";
}) => {
  trackSimpleEvent({
    event: "content_diagnostics_findings_bulk_dismissed",
    triggered_from: tab,
    event_detail: `${dismissedCount}/${selectedCount}`,
    duration_ms: durationMs,
    result,
  });
};
