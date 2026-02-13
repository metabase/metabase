import type { FormLocation } from "metabase/databases/types";
import type {
  ChecklistItemCTA,
  ChecklistItemValue,
} from "metabase/home/components/Onboarding/types";
import type { KeyboardShortcutId } from "metabase/palette/shortcuts";
import type { ClickActionSection } from "metabase/visualizations/types";
import type {
  ConcreteTableId,
  Engine,
  RelatedDashboardXRays,
  TransformId,
  VisualizationDisplay,
} from "metabase-types/api";

type SimpleEventSchema = {
  event: string;
  target_id?: number | string | null;
  triggered_from?: string | null;
  duration_ms?: number | null;
  result?: string | null;
  event_detail?: string | null;
};

type ValidateEvent<
  T extends SimpleEventSchema &
    Record<Exclude<keyof T, keyof SimpleEventSchema>, never>,
> = T;

export type CustomSMTPSetupClickedEvent = ValidateEvent<{
  event: "custom_smtp_setup_clicked";
  event_detail: "self-hosted" | "cloud";
}>;

export type CustomSMTPSetupSuccessEvent = ValidateEvent<{
  event: "custom_smtp_setup_success";
  event_detail: "self-hosted" | "cloud";
}>;

type CSVUploadClickedEvent = ValidateEvent<{
  event: "csv_upload_clicked";
  triggered_from: "add-data-modal" | "collection";
}>;

export type DatabaseAddClickedEvent = ValidateEvent<{
  event: "database_add_clicked";
  triggered_from: "db-list";
}>;

export type DatabaseEngineSelectedEvent = ValidateEvent<{
  event: "database_setup_selected";
  event_detail: Engine["driver-name"];
  triggered_from: "add-data-modal";
}>;

type OnboardingChecklistOpenedEvent = ValidateEvent<{
  event: "onboarding_checklist_opened";
}>;

type OnboardingChecklistItemExpandedEvent = ValidateEvent<{
  event: "onboarding_checklist_item_expanded";
  triggered_from: ChecklistItemValue;
}>;

type OnboardingChecklistItemCTAClickedEvent = ValidateEvent<{
  event: "onboarding_checklist_cta_clicked";
  triggered_from: ChecklistItemValue;
  event_detail: ChecklistItemCTA;
}>;

export type NewsletterToggleClickedEvent = ValidateEvent<{
  event: "newsletter-toggle-clicked";
  triggered_from: "setup";
  event_detail: "opted-in" | "opted-out";
}>;

export type NewIFrameCardCreatedEvent = ValidateEvent<{
  event: "new_iframe_card_created";
  event_detail: string | null;
  target_id: number | null;
}>;

export type MoveToTrashEvent = ValidateEvent<{
  event: "moved-to-trash";
  target_id: number | null;
  triggered_from: "collection" | "detail_page" | "cleanup_modal";
  duration_ms: number | null;
  result: "success" | "failure";
  event_detail:
    | "question"
    | "model"
    | "metric"
    | "dashboard"
    | "collection"
    | "dataset"
    | "indexed-entity"
    | "snippet"
    | "document"
    | "table"
    | "transform";
}>;

export type ErrorDiagnosticModalOpenedEvent = ValidateEvent<{
  event: "error_diagnostic_modal_opened";
  triggered_from: "profile-menu" | "command-palette";
}>;

export type ErrorDiagnosticModalSubmittedEvent = ValidateEvent<{
  event: "error_diagnostic_modal_submitted";
  event_detail: "download-diagnostics" | "submit-report";
}>;

export type DependencyEntitySelected = ValidateEvent<{
  event: "dependency_entity_selected";
  triggered_from:
    | "dependency-graph"
    | "diagnostics-broken-list"
    | "diagnostics-unreferenced-list"
    | "data-structure"
    | "transform-run-list";
  event_detail?: string;
  target_id: number | string;
}>;

export type DependencyDiagnosticsEntitySelected = ValidateEvent<{
  event: "dependency_diagnostics_entity_selected";
  triggered_from: "broken" | "unreferenced";
  target_id: number;
  event_detail?: string;
}>;

export type GsheetsConnectionClickedEvent = ValidateEvent<{
  event: "sheets_connection_clicked";
  triggered_from: "db-page" | "add-data-modal";
}>;

export type GsheetsImportClickedEvent = ValidateEvent<{
  event: "sheets_import_by_url_clicked";
  triggered_from: "sheets-url-popup";
}>;

export type KeyboardShortcutPerformEvent = ValidateEvent<{
  event: "keyboard_shortcut_performed";
  event_detail: KeyboardShortcutId;
}>;

export type NewEntityInitiatedEvent = ValidateEvent<{
  event: "plus_button_clicked";
  triggered_from: "model" | "metric" | "collection-header" | "collection-nav";
}>;

export type NewButtonClickedEvent = ValidateEvent<{
  event: "new_button_clicked";
  triggered_from: "app-bar" | "empty-collection";
}>;

export type NewButtonItemClickedEvent = ValidateEvent<{
  event: "new_button_item_clicked";
  triggered_from: "question" | "native-query" | "dashboard";
}>;

export type VisualizeAnotherWayClickedEvent = ValidateEvent<{
  event: "visualize_another_way_clicked";
  triggered_from: "question-list" | "dashcard-actions-panel";
}>;

export type VisualizerModalEvent = ValidateEvent<
  | {
      event:
        | "visualizer_add_more_data_clicked"
        | "visualizer_show_columns_clicked"
        | "visualizer_settings_clicked"
        | "visualizer_save_clicked"
        | "visualizer_close_clicked"
        | "visualizer_view_as_table_clicked";
      triggered_from: "visualizer-modal";
    }
  | {
      event: "visualizer_data_changed";
      event_detail:
        | "visualizer_viz_type_changed"
        | "visualizer_datasource_removed"
        | "visualizer_datasource_added"
        | "visualizer_datasource_replaced"
        | "visualizer_datasource_reset"
        | "visualizer_column_removed"
        | "visualizer_column_added";
      triggered_from: "visualizer-modal";
    }
>;

export type EventsClickedEvent = ValidateEvent<{
  event: "events_clicked";
  triggered_from: "chart" | "collection";
}>;

export type AddDataModalOpenedEvent = ValidateEvent<{
  event: "data_add_modal_opened";
  triggered_from: "getting-started" | "left-nav";
}>;

export type AddDataModalTabEvent = ValidateEvent<{
  event: "csv_tab_clicked" | "sheets_tab_clicked" | "database_tab_clicked";
  triggered_from: "add-data-modal";
}>;

export type DashboardFilterCreatedEvent = ValidateEvent<{
  event: "dashboard_filter_created";
  target_id: number | null;
  triggered_from: VisualizationDisplay | null;
  event_detail: string | null;
}>;

export type DashboardFilterMovedEvent = ValidateEvent<{
  event: "dashboard_filter_moved";
  target_id: number | null;
  triggered_from: VisualizationDisplay | null;
  event_detail: VisualizationDisplay | null;
}>;

export type SdkIframeEmbedSetupExperience =
  | "dashboard"
  | "chart"
  | "exploration"
  | "browser"
  | "metabot";

export type EmbedWizardOpenedEvent = ValidateEvent<{
  event: "embed_wizard_opened";
}>;

export type EmbedWizardExperienceCompletedEvent = ValidateEvent<{
  event: "embed_wizard_experience_completed";
  event_detail: string;
}>;

export type EmbedWizardResourceSelectionCompletedEvent = ValidateEvent<{
  event: "embed_wizard_resource_selection_completed";
  event_detail: string;
}>;

export type EmbedWizardOptionsCompletedEvent = ValidateEvent<{
  event: "embed_wizard_options_completed";
  event_detail: string;
}>;

export type EmbedWizardCodeCopiedEvent = ValidateEvent<{
  event: "embed_wizard_code_copied";
  event_detail: string;
}>;

export type TableEditingSettingsToggledEvent = ValidateEvent<{
  event: "edit_data_settings_toggled";
  event_detail: "on" | "off";
  target_id: number;
  triggered_from: "admin-settings-databases";
}>;

export type TableEditButtonClickedEvent = ValidateEvent<{
  event: "edit_data_button_clicked";
  target_id: number;
  triggered_from: "table-browser";
}>;

export type TableEditingRecordModifiedEvent = ValidateEvent<{
  event: "edit_data_record_modified";
  event_detail: "create" | "update" | "delete";
  target_id: number;
  triggered_from: "inline" | "modal";
  result: "success" | "error";
}>;

export type ConnectionStringParsedSuccessEvent = ValidateEvent<{
  event: "connection_string_parsed_success";
  triggered_from: FormLocation;
}>;

export type ConnectionStringParsedFailedEvent = ValidateEvent<{
  event: "connection_string_parsed_failed";
  triggered_from: FormLocation;
}>;

export type TransformTriggerManualRunEvent = ValidateEvent<{
  event: "transform_trigger_manual_run";
  target_id: TransformId;
}>;

export type TransformJobTriggerManualRunEvent = ValidateEvent<{
  event: "transform_job_trigger_manual_run";
  target_id: TransformId;
}>;

export type TransformCreateEvent = ValidateEvent<{
  event: "transform_create";
  event_detail: "query" | "native" | "python" | "saved-question";
}>;

export type TransformCreatedEvent = ValidateEvent<{
  event: "transform_created";
  target_id: number;
}>;

export type TransformRunTagsUpdated = ValidateEvent<{
  event: "transform_tags_updated";
  result: "success" | "failure";
  triggered_from: "transform_run_page";
  event_detail: "tag_added" | "tag_removed";
  target_id: number;
}>;

export type DocumentCreatedEvent = ValidateEvent<{
  event: "document_created";
  target_id: number;
}>;

export type DocumentUpdatedEvent = ValidateEvent<{
  event: "document_saved";
  target_id: number;
}>;

export type DocumentAddCardEvent = ValidateEvent<{
  event: "document_add_card";
  target_id: number | null;
}>;

export type DocumentAddSmartLinkEvent = ValidateEvent<{
  event: "document_add_smart_link";
  target_id: number | null;
}>;

export type DocumentReplaceCardEvent = ValidateEvent<{
  event: "document_replace_card";
  target_id: number | null;
}>;

export type DocumentDuplicatedEvent = ValidateEvent<{
  event: "document_duplicated";
  target_id: number | null;
}>;

export type DocumentAskMetabotEvent = ValidateEvent<{
  event: "document_ask_metabot";
  target_id: number | null;
}>;

export type DocumentPrintEvent = ValidateEvent<{
  event: "document_print";
  target_id: number | null;
}>;

export type DocumentAddSupportingTextEvent = ValidateEvent<{
  event: "document_add_supporting_text";
  target_id: number | null;
}>;

export type DatabaseHelpClickedEvent = ValidateEvent<{
  event: "database_help_clicked";
  triggered_from: "admin" | "setup";
}>;

export type XRayTableClickedEvent = ValidateEvent<{
  event: "x-ray_clicked";
  event_detail: "table";
  triggered_from: "homepage" | "browse_database";
}>;

export type XRayDataReferenceClickedEvent = ValidateEvent<{
  event: "x-ray_clicked";
  event_detail: "table" | "field" | "segment";
  triggered_from: "data_reference";
}>;

export type XRaySuggestionClickedEvent = ValidateEvent<{
  event: "x-ray_clicked";
  event_detail: keyof RelatedDashboardXRays;
  triggered_from: "suggestion_sidebar";
}>;

export type XRayAutoInsightsClicked = ValidateEvent<{
  event: "x-ray_automatic_insights_clicked";
  event_detail: "x-ray" | "compare_to_rest";
}>;

export type XRayClickedEvent =
  | XRayTableClickedEvent
  | XRayDataReferenceClickedEvent
  | XRaySuggestionClickedEvent
  | XRayAutoInsightsClicked;

export type XRaySavedEvent = ValidateEvent<{
  event: "x-ray_saved";
}>;

export type XRayEvent = XRayClickedEvent | XRaySavedEvent;

export type EmbedWizardEvent =
  | EmbedWizardOpenedEvent
  | EmbedWizardExperienceCompletedEvent
  | EmbedWizardResourceSelectionCompletedEvent
  | EmbedWizardOptionsCompletedEvent
  | EmbedWizardCodeCopiedEvent;

export type TableEditingEvent =
  | TableEditingSettingsToggledEvent
  | TableEditButtonClickedEvent
  | TableEditingRecordModifiedEvent;

export type MetabotChatOpenedEvent = ValidateEvent<{
  event: "metabot_chat_opened";
  triggered_from:
    | "header"
    | "command_palette"
    | "keyboard_shortcut"
    | "native_editor";
}>;

export type MetabotRequestSentEvent = ValidateEvent<{
  event: "metabot_request_sent";
}>;

export type MetabotFixQueryClickedEvent = ValidateEvent<{
  event: "metabot_fix_query_clicked";
}>;

export type MetabotExplainChartClickedEvent = ValidateEvent<{
  event: "metabot_explain_chart_clicked";
}>;

export type MetabotEvent =
  | MetabotChatOpenedEvent
  | MetabotRequestSentEvent
  | MetabotFixQueryClickedEvent
  | MetabotExplainChartClickedEvent;

export type RevertVersionEvent = ValidateEvent<{
  event: "revert_version_clicked";
  event_detail: "card" | "dashboard" | "document" | "transform";
}>;

export type LearnAboutDataClickedEvent = ValidateEvent<{
  event: "learn_about_our_data_clicked";
}>;

export type MetadataEditEventDetail =
  | "type_casting"
  | "semantic_type_change"
  | "visibility_change"
  | "filtering_change"
  | "display_values"
  | "json_unfolding"
  | "formatting";

export type MetadataEditEventTriggeredFrom = "admin" | "data_studio";

export type MetadataEditEvent = ValidateEvent<{
  event: "metadata_edited";
  event_detail: MetadataEditEventDetail;
  triggered_from: MetadataEditEventTriggeredFrom;
}>;

export type BookmarkTableEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "table";
  triggered_from: "collection_list";
}>;

export type BookmarkQuestionEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "question";
  triggered_from: "qb_action_panel" | "collection_list";
}>;

export type BookmarkModelEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "model";
  triggered_from: "qb_action_panel" | "collection_list";
}>;

export type BookmarkMetricEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "metric";
  triggered_from: "qb_action_panel" | "collection_list" | "browse_metrics";
}>;

export type BookmarkDashboardEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "dashboard";
  triggered_from: "dashboard_header" | "collection_list";
}>;

export type BookmarkCollectionEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "collection";
  triggered_from: "collection_header" | "collection_list";
}>;

export type BookmarkDocumentEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "document";
  triggered_from: "collection_list" | "document_header";
}>;

export type ClickActionPerformedEvent = ValidateEvent<{
  event: "click_action";
  triggered_from: ClickActionSection;
}>;

export type RemoteSyncBranchSwitchedEvent = ValidateEvent<{
  event: "remote_sync_branch_switched";
  triggered_from: "admin-settings" | "app-bar";
}>;

export type RemoteSyncBranchCreatedEvent = ValidateEvent<{
  event: "remote_sync_branch_created";
  triggered_from: "branch-picker" | "conflict-modal";
}>;

export type RemoteSyncPullChangesEvent = ValidateEvent<{
  event: "remote_sync_pull_changes";
  triggered_from: "admin-settings" | "app-bar";
  event_detail?: "force";
}>;

export type RemoteSyncPushChangesEvent = ValidateEvent<{
  event: "remote_sync_push_changes";
  triggered_from: "conflict-modal" | "app-bar";
  event_detail?: "force";
}>;

export type RemoteSyncSettingsChangedEvent = ValidateEvent<{
  event: "remote_sync_settings_changed";
  triggered_from: "admin-settings" | "data-studio";
}>;

export type RemoteSyncDeactivatedEvent = ValidateEvent<{
  event: "remote_sync_deactivated";
  triggered_from: "admin-settings";
}>;

export type RemoteSyncEvent =
  | RemoteSyncBranchSwitchedEvent
  | RemoteSyncBranchCreatedEvent
  | RemoteSyncPullChangesEvent
  | RemoteSyncPushChangesEvent
  | RemoteSyncSettingsChangedEvent
  | RemoteSyncDeactivatedEvent;

export type BookmarkEvent =
  | BookmarkTableEvent
  | BookmarkQuestionEvent
  | BookmarkModelEvent
  | BookmarkMetricEvent
  | BookmarkDashboardEvent
  | BookmarkCollectionEvent
  | BookmarkDocumentEvent;

export type DataStudioLibraryCreatedEvent = ValidateEvent<{
  event: "data_studio_library_created";
  target_id: number | null;
}>;

export type DataStudioTablePublishedEvent = ValidateEvent<{
  event: "data_studio_table_published";
  target_id: ConcreteTableId | undefined;
}>;

export type DataStudioGlossaryCreatedEvent = ValidateEvent<{
  event: "data_studio_glossary_term_created";
  target_id: number | null;
}>;

export type DataStudioGlossaryEditedEvent = ValidateEvent<{
  event: "data_studio_glossary_term_updated";
  target_id: number | null;
}>;

export type DataStudioGlossaryDeletedEvent = ValidateEvent<{
  event: "data_studio_glossary_term_deleted";
  target_id: number | null;
}>;

export type DataStudioTablePickerFiltersAppliedEvent = ValidateEvent<{
  event: "data_studio_table_picker_filters_applied";
}>;

export type DataStudioTablePickerFiltersClearedEvent = ValidateEvent<{
  event: "data_studio_table_picker_filters_cleared";
}>;

export type DataStudioTablePickerSearchPerformedEvent = ValidateEvent<{
  event: "data_studio_table_picker_search_performed";
}>;

export type DataStudioTableUnpublishedEvent = ValidateEvent<{
  event: "data_studio_table_unpublished";
  target_id: ConcreteTableId | undefined;
}>;

export type DataStudioBulkSyncSettingsClickedEvent = ValidateEvent<{
  event: "data_studio_bulk_sync_settings_clicked";
}>;

export type DataStudioBulkAttributeUpdatedEvent = ValidateEvent<{
  event: "data_studio_bulk_attribute_updated";
  event_detail: "owner" | "layer" | "entity_type" | "data_source";
  result: "success" | "failure";
}>;

export type DataStudioTableSchemaSyncedEvent = ValidateEvent<{
  event: "data_studio_table_schema_sync_started";
  result: "success" | "failure";
}>;

export type DataStudioTableFieldsRescannedEvent = ValidateEvent<{
  event: "data_studio_table_fields_rescan_started";
  result: "success" | "failure";
}>;

export type DataStudioTableFieldValuesDiscardedEvent = ValidateEvent<{
  event: "data_studio_table_field_values_discard_started";
  result: "success" | "failure";
}>;

export type DataStudioEvent =
  | DataStudioLibraryCreatedEvent
  | DataStudioTablePublishedEvent
  | DataStudioGlossaryCreatedEvent
  | DataStudioGlossaryEditedEvent
  | DataStudioGlossaryDeletedEvent
  | DataStudioTablePickerFiltersAppliedEvent
  | DataStudioTablePickerFiltersClearedEvent
  | DataStudioTablePickerSearchPerformedEvent
  | DataStudioTableUnpublishedEvent
  | DataStudioBulkSyncSettingsClickedEvent
  | DataStudioBulkAttributeUpdatedEvent
  | DataStudioTableSchemaSyncedEvent
  | DataStudioTableFieldsRescannedEvent
  | DataStudioTableFieldValuesDiscardedEvent;

export type UnsavedChangesWarningDisplayedEvent = ValidateEvent<{
  event: "unsaved_changes_warning_displayed";
  triggered_from: "document";
  target_id: number | null;
}>;

export type SimpleEvent =
  | CustomSMTPSetupClickedEvent
  | CustomSMTPSetupSuccessEvent
  | CSVUploadClickedEvent
  | DatabaseAddClickedEvent
  | DatabaseEngineSelectedEvent
  | DependencyEntitySelected
  | DependencyDiagnosticsEntitySelected
  | NewIFrameCardCreatedEvent
  | NewsletterToggleClickedEvent
  | OnboardingChecklistOpenedEvent
  | OnboardingChecklistItemExpandedEvent
  | OnboardingChecklistItemCTAClickedEvent
  | MoveToTrashEvent
  | ErrorDiagnosticModalOpenedEvent
  | ErrorDiagnosticModalSubmittedEvent
  | GsheetsConnectionClickedEvent
  | GsheetsImportClickedEvent
  | KeyboardShortcutPerformEvent
  | NewEntityInitiatedEvent
  | NewButtonClickedEvent
  | NewButtonItemClickedEvent
  | VisualizeAnotherWayClickedEvent
  | VisualizerModalEvent
  | EventsClickedEvent
  | AddDataModalOpenedEvent
  | AddDataModalTabEvent
  | DashboardFilterCreatedEvent
  | DashboardFilterMovedEvent
  | EmbedWizardEvent
  | TableEditingEvent
  | ConnectionStringParsedSuccessEvent
  | ConnectionStringParsedFailedEvent
  | TransformTriggerManualRunEvent
  | TransformJobTriggerManualRunEvent
  | TransformCreatedEvent
  | TransformCreateEvent
  | TransformRunTagsUpdated
  | DocumentAddCardEvent
  | DocumentAddSmartLinkEvent
  | DocumentAddSupportingTextEvent
  | DocumentAskMetabotEvent
  | DocumentCreatedEvent
  | DocumentReplaceCardEvent
  | DocumentDuplicatedEvent
  | DocumentUpdatedEvent
  | DocumentPrintEvent
  | DatabaseHelpClickedEvent
  | XRayEvent
  | MetabotEvent
  | RevertVersionEvent
  | LearnAboutDataClickedEvent
  | MetadataEditEvent
  | BookmarkEvent
  | RemoteSyncEvent
  | ClickActionPerformedEvent
  | DataStudioEvent
  | UnsavedChangesWarningDisplayedEvent;
