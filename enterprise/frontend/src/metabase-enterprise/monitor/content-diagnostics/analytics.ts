import { trackSimpleEvent } from "metabase/analytics";
import type {
  ContentDiagnosticsEntityType,
  ContentDiagnosticsFindingType,
} from "metabase-types/api";

/** The shape every tab's filter options share, plus its own numeric threshold. */
type ContentDiagnosticsFilterOptions = {
  entityTypes: string[];
  includePersonalCollections: boolean;
  [threshold: string]: unknown;
};

type ContentDiagnosticsFilterDimension =
  | "entity_type"
  | "personal_collections"
  | "threshold";

type ContentDiagnosticsResult = "success" | "failure";

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

export const trackContentDiagnosticsFindingsBulkTrashed = ({
  count,
  durationMs,
  result,
}: {
  count: number;
  durationMs: number;
  result: ContentDiagnosticsResult;
}) => {
  trackSimpleEvent({
    event: "content_diagnostics_findings_bulk_trashed",
    event_detail: String(count),
    duration_ms: durationMs,
    result,
  });
};

const ENTITY_TYPES_KEY = "entityTypes";
const PERSONAL_COLLECTIONS_KEY = "includePersonalCollections";

/**
 * Which filter the user just changed, for `trackContentDiagnosticsFiltersChanged`. Every tab
 * filters by entity type and by personal collections; the third filter is a numeric threshold
 * whose meaning is the tab's own, so it reports as one dimension and `triggered_from` says
 * which threshold it was.
 */
export function getChangedFilterDimension(
  previousOptions: ContentDiagnosticsFilterOptions,
  nextOptions: ContentDiagnosticsFilterOptions,
): ContentDiagnosticsFilterDimension | null {
  const previousTypes = previousOptions.entityTypes;
  const nextTypes = nextOptions.entityTypes;

  if (
    previousTypes.length !== nextTypes.length ||
    previousTypes.some((type, index) => type !== nextTypes[index])
  ) {
    return "entity_type";
  }

  if (
    previousOptions.includePersonalCollections !==
    nextOptions.includePersonalCollections
  ) {
    return "personal_collections";
  }

  const hasThresholdChange = Object.keys(previousOptions).some(
    (key) =>
      key !== ENTITY_TYPES_KEY &&
      key !== PERSONAL_COLLECTIONS_KEY &&
      previousOptions[key] !== nextOptions[key],
  );

  return hasThresholdChange ? "threshold" : null;
}
