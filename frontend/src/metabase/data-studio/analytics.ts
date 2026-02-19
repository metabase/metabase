import { trackSimpleEvent } from "metabase/lib/analytics";
import type { DependencyEntitySelected } from "metabase-types/analytics";
import type { CollectionId, ConcreteTableId } from "metabase-types/api";

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
  triggeredFrom: DependencyEntitySelected["triggered_from"];
}) => {
  trackSimpleEvent({
    event: "dependency_entity_selected",
    triggered_from: triggeredFrom,
    event_detail: eventDetail,
    target_id: entityId,
  });
};
