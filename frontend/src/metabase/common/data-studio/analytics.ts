import { trackSimpleEvent } from "metabase/analytics";
import type {
  CollectionId,
  ConcreteTableId,
  UsageMetadataCandidateType,
} from "metabase-types/api";

export const trackDataStudioLibraryCreated = (id: CollectionId) => {
  trackSimpleEvent({
    event: "data_studio_library_created",
    target_id: Number(id),
  });
};

export const trackDataStudioTablePublished = (id?: ConcreteTableId) => {
  trackSimpleEvent({
    event: "data_studio_table_published",
    target_id: id,
  });
};

export const trackDataStudioGlossaryTermCreated = (id: number | null) => {
  trackSimpleEvent({
    event: "data_studio_glossary_term_created",
    target_id: id,
  });
};

export const trackDataStudioGlossaryTermUpdated = (id: number | null) => {
  trackSimpleEvent({
    event: "data_studio_glossary_term_updated",
    target_id: id,
  });
};

export const trackDataStudioGlossaryTermDeleted = (id: number | null) => {
  trackSimpleEvent({
    event: "data_studio_glossary_term_deleted",
    target_id: id,
  });
};

export const trackDataStudioTablePickerFiltersApplied = () => {
  trackSimpleEvent({
    event: "data_studio_table_picker_filters_applied",
  });
};

export const trackDataStudioTablePickerFiltersCleared = () => {
  trackSimpleEvent({
    event: "data_studio_table_picker_filters_cleared",
  });
};

export const trackDataStudioTablePickerSearchPerformed = () => {
  trackSimpleEvent({
    event: "data_studio_table_picker_search_performed",
  });
};

export const trackDataStudioTableUnpublished = (id?: ConcreteTableId) => {
  trackSimpleEvent({
    event: "data_studio_table_unpublished",
    target_id: id,
  });
};

export const trackDataStudioBulkSyncSettingsClicked = () => {
  trackSimpleEvent({
    event: "data_studio_bulk_sync_settings_clicked",
  });
};

export const trackDataStudioBulkAttributeUpdated = (
  attributeType: "owner" | "layer" | "entity_type" | "data_source",
  result: "success" | "failure",
) => {
  trackSimpleEvent({
    event: "data_studio_bulk_attribute_updated",
    event_detail: attributeType,
    result,
  });
};

export const trackDataStudioTableSchemaSyncStarted = (
  result: "success" | "failure",
) => {
  trackSimpleEvent({
    event: "data_studio_table_schema_sync_started",
    result,
  });
};

export const trackDataStudioTableFieldsRescanStarted = (
  result: "success" | "failure",
) => {
  trackSimpleEvent({
    event: "data_studio_table_fields_rescan_started",
    result,
  });
};

export const trackDataStudioTableFieldValuesDiscardStarted = (
  result: "success" | "failure",
) => {
  trackSimpleEvent({
    event: "data_studio_table_field_values_discard_started",
    result,
  });
};

export const trackDependencyDiagnosticsEntitySelected = ({
  triggeredFrom,
  entityId,
  entityType,
}: {
  entityId: number;
  entityType: string;
  triggeredFrom: "broken" | "unreferenced";
}) => {
  trackSimpleEvent({
    event: "dependency_diagnostics_entity_selected",
    triggered_from: triggeredFrom,
    target_id: entityId,
    event_detail: entityType,
  });
};

export const trackDependencyEntitySelected = ({
  entityId,
  eventDetail,
  triggeredFrom,
}: {
  entityId: number;
  eventDetail?: string;
  triggeredFrom:
    | "dependency-graph"
    | "diagnostics-broken-list"
    | "diagnostics-unreferenced-list"
    | "data-structure"
    | "transform-run-list";
}) => {
  trackSimpleEvent({
    event: "dependency_entity_selected",
    triggered_from: triggeredFrom,
    event_detail: eventDetail,
    target_id: entityId,
  });
};

export const trackDataStudioOpened = () => {
  trackSimpleEvent({
    event: "data_studio_opened",
    triggered_from: "nav_menu",
  });
};

export const trackDataStudioCleanupOpened = () => {
  trackSimpleEvent({
    event: "data_studio_cleanup_opened",
    triggered_from: "data_studio_nav",
  });
};

export const trackDataStudioCleanupRefreshStarted = (
  result: "success" | "failure" | "already_running",
) => {
  trackSimpleEvent({
    event: "data_studio_cleanup_refresh_started",
    result,
  });
};

export const trackDataStudioCleanupTableSelected = (tableId: number) => {
  trackSimpleEvent({
    event: "data_studio_cleanup_table_selected",
    target_id: tableId,
  });
};

export const trackDataStudioCleanupCandidateInspected = (
  candidateId: number,
  candidateType: UsageMetadataCandidateType,
) => {
  trackSimpleEvent({
    event: "data_studio_cleanup_candidate_inspected",
    target_id: candidateId,
    event_detail: candidateType,
  });
};

export const trackDataStudioCleanupCandidateAction = ({
  action,
  candidateId,
  candidateType,
  result,
}: {
  action: "create" | "dismiss" | "restore";
  candidateId: number;
  candidateType: UsageMetadataCandidateType;
  result: "success" | "failure";
}) => {
  const properties = {
    target_id: candidateId,
    event_detail: candidateType,
    result,
  };

  switch (action) {
    case "create":
      trackSimpleEvent({
        event: "data_studio_cleanup_candidate_create",
        ...properties,
      });
      break;
    case "dismiss":
      trackSimpleEvent({
        event: "data_studio_cleanup_candidate_dismiss",
        ...properties,
      });
      break;
    case "restore":
      trackSimpleEvent({
        event: "data_studio_cleanup_candidate_restore",
        ...properties,
      });
      break;
  }
};

export const trackDataStudioCleanupPublicationStarted = (tableId: number) => {
  trackSimpleEvent({
    event: "data_studio_cleanup_publication_started",
    target_id: tableId,
  });
};

export const trackMetricCreateStarted = (
  triggeredFrom: "browse_metrics" | "data_studio_library" | "command_palette",
) => {
  trackSimpleEvent({
    event: "metric_create_started",
    triggered_from: triggeredFrom,
  });
};

export const trackMetricCreated = (
  result: "success" | "failure",
  triggeredFrom: "data_studio" | "main_app",
  targetId: number | null,
) => {
  trackSimpleEvent({
    event: "metric_created",
    triggered_from: triggeredFrom,
    result,
    target_id: targetId,
  });
};

export const trackMeasureCreateStarted = (tableId: ConcreteTableId) => {
  trackSimpleEvent({
    event: "measure_create_started",
    triggered_from: "data_studio_measures_list",
    target_id: tableId,
  });
};

export const trackMeasureCreated = (
  result: "success" | "failure",
  measureId?: number,
) => {
  trackSimpleEvent({
    event: "measure_created",
    triggered_from: "data_studio_measures",
    result,
    target_id: measureId ?? null,
  });
};

export const trackSegmentCreateStarted = (
  triggeredFrom: "data_studio_segments" | "admin_datamodel_segments",
  tableId?: number,
) => {
  trackSimpleEvent({
    event: "segment_create_started",
    triggered_from: triggeredFrom,
    target_id: tableId ?? null,
  });
};

export const trackSegmentCreated = (
  result: "success" | "failure",
  triggeredFrom: "data_studio_segments" | "admin_datamodel_segments",
  segmentId?: number,
) => {
  trackSimpleEvent({
    event: "segment_created",
    triggered_from: triggeredFrom,
    result,
    target_id: segmentId ?? null,
  });
};
