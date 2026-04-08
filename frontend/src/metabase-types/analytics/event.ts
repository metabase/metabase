import type {
  ConcreteTableId,
  Engine,
  RelatedDashboardXRays,
  TransformId,
  VisualizationDisplay,
} from "metabase-types/api";

export type SimpleEventSchema = {
  event: string;
  target_id?: number | null;
  triggered_from?: string | null;
  duration_ms?: number | null;
  result?: string | null;
  event_detail?: string | null;
};

export type ValidateEvent<
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

type DatabaseAddClickedEvent = ValidateEvent<{
  event: "database_add_clicked";
  triggered_from: "db-list";
}>;

type DatabaseEngineSelectedEvent = ValidateEvent<{
  event: "database_setup_selected";
  event_detail: Engine["driver-name"];
  triggered_from: "add-data-modal";
}>;

type OnboardingChecklistOpenedEvent = ValidateEvent<{
  event: "onboarding_checklist_opened";
}>;

export type NewsletterToggleClickedEvent = ValidateEvent<{
  event: "newsletter-toggle-clicked";
  triggered_from: "setup";
  event_detail: "opted-in" | "opted-out";
}>;

type NewIFrameCardCreatedEvent = ValidateEvent<{
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
  target_id: number;
}>;

type DependencyDiagnosticsEntitySelected = ValidateEvent<{
  event: "dependency_diagnostics_entity_selected";
  triggered_from: "broken" | "unreferenced";
  target_id: number;
  event_detail?: string;
}>;

export type GsheetsConnectionClickedEvent = ValidateEvent<{
  event: "sheets_connection_clicked";
  triggered_from: "db-page" | "add-data-modal";
}>;

type GsheetsImportClickedEvent = ValidateEvent<{
  event: "sheets_import_by_url_clicked";
  triggered_from: "sheets-url-popup";
}>;

export type NewEntityInitiatedEvent = ValidateEvent<{
  event: "plus_button_clicked";
  triggered_from: "model" | "metric" | "collection-header" | "collection-nav";
}>;

type NewButtonClickedEvent = ValidateEvent<{
  event: "new_button_clicked";
  triggered_from: "app-bar" | "empty-collection";
}>;

type NewButtonItemClickedEvent = ValidateEvent<{
  event: "new_button_item_clicked";
  triggered_from: "question" | "native-query" | "dashboard";
}>;

type VisualizeAnotherWayClickedEvent = ValidateEvent<{
  event: "visualize_another_way_clicked";
  triggered_from: "question-list" | "dashcard-actions-panel";
}>;

type VisualizerModalEvent = ValidateEvent<
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

type EventsClickedEvent = ValidateEvent<{
  event: "events_clicked";
  triggered_from: "chart" | "collection";
}>;

type AddDataModalOpenedEvent = ValidateEvent<{
  event: "data_add_modal_opened";
  triggered_from: "getting-started" | "left-nav";
}>;

type AddDataModalTabEvent = ValidateEvent<{
  event: "csv_tab_clicked" | "sheets_tab_clicked" | "database_tab_clicked";
  triggered_from: "add-data-modal";
}>;

type DashboardFilterCreatedEvent = ValidateEvent<{
  event: "dashboard_filter_created";
  target_id: number | null;
  triggered_from: VisualizationDisplay | null;
  event_detail: string | null;
}>;

type DashboardFilterMovedEvent = ValidateEvent<{
  event: "dashboard_filter_moved";
  target_id: number | null;
  triggered_from: VisualizationDisplay | null;
  event_detail: VisualizationDisplay | null;
}>;

type EmbedWizardOpenedEvent = ValidateEvent<{
  event: "embed_wizard_opened";
}>;

type EmbedWizardExperienceCompletedEvent = ValidateEvent<{
  event: "embed_wizard_experience_completed";
  event_detail: string;
}>;

type EmbedWizardResourceSelectionCompletedEvent = ValidateEvent<{
  event: "embed_wizard_resource_selection_completed";
  event_detail: string;
}>;

type EmbedWizardOptionsCompletedEvent = ValidateEvent<{
  event: "embed_wizard_options_completed";
  event_detail: string;
}>;

type EmbedWizardCodeCopiedEvent = ValidateEvent<{
  event: "embed_wizard_code_copied";
  event_detail: string;
}>;

type TableEditingSettingsToggledEvent = ValidateEvent<{
  event: "edit_data_settings_toggled";
  event_detail: "on" | "off";
  target_id: number;
  triggered_from: "admin-settings-databases";
}>;

type TableEditButtonClickedEvent = ValidateEvent<{
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

export type TransformTriggerManualRunEvent = ValidateEvent<{
  event: "transform_trigger_manual_run";
  target_id: TransformId;
}>;

type TransformJobTriggerManualRunEvent = ValidateEvent<{
  event: "transform_job_trigger_manual_run";
  target_id: TransformId;
}>;

type TransformCreateEvent = ValidateEvent<{
  event: "transform_create";
  event_detail: "query" | "native" | "python" | "saved-question";
}>;

type TransformCreatedEvent = ValidateEvent<{
  event: "transform_created";
  target_id: number;
  event_detail: "incremental" | undefined;
}>;

type TransformRunTagsUpdated = ValidateEvent<{
  event: "transform_tags_updated";
  result: "success" | "failure";
  triggered_from: "transform_run_page";
  event_detail: "tag_added" | "tag_removed";
  target_id: number;
}>;

type TransformJobCreatedEvent = ValidateEvent<{
  event: "transform_job_created";
  triggered_from: "transform_job_new";
  result: "success" | "failure";
  target_id: number | null;
}>;

type TransformInspectLensLoadedEvent = ValidateEvent<{
  event: "transform_inspect_lens_loaded";
  target_id: TransformId;
  event_detail: string;
  duration_ms: number;
}>;

type TransformInspectDrillLensClickedEvent = ValidateEvent<{
  event: "transform_inspect_drill_lens_clicked";
  target_id: TransformId;
  event_detail: string;
  triggered_from: "card_drills" | "join_analysis";
}>;

type TransformInspectAlertClickedEvent = ValidateEvent<{
  event: "transform_inspect_alert_clicked";
  target_id: TransformId;
  event_detail: string;
}>;

type TransformInspectDrillLensClosedEvent = ValidateEvent<{
  event: "transform_inspect_drill_lens_closed";
  target_id: TransformId;
  event_detail: string;
}>;

type TransformInspectEvent =
  | TransformInspectLensLoadedEvent
  | TransformInspectDrillLensClickedEvent
  | TransformInspectAlertClickedEvent
  | TransformInspectDrillLensClosedEvent;

type DocumentCreatedEvent = ValidateEvent<{
  event: "document_created";
  target_id: number;
}>;

type DocumentUpdatedEvent = ValidateEvent<{
  event: "document_saved";
  target_id: number;
}>;

type DocumentAddCardEvent = ValidateEvent<{
  event: "document_add_card";
  target_id: number | null;
}>;

type DocumentAddSmartLinkEvent = ValidateEvent<{
  event: "document_add_smart_link";
  target_id: number | null;
}>;

type DocumentReplaceCardEvent = ValidateEvent<{
  event: "document_replace_card";
  target_id: number | null;
}>;

type DocumentDuplicatedEvent = ValidateEvent<{
  event: "document_duplicated";
  target_id: number | null;
}>;

type DocumentAskMetabotEvent = ValidateEvent<{
  event: "document_ask_metabot";
  target_id: number | null;
}>;

type DocumentPrintEvent = ValidateEvent<{
  event: "document_print";
  target_id: number | null;
}>;

type DocumentAddSupportingTextEvent = ValidateEvent<{
  event: "document_add_supporting_text";
  target_id: number | null;
}>;

type DatabaseHelpClickedEvent = ValidateEvent<{
  event: "database_help_clicked";
  triggered_from: "admin" | "setup";
}>;

type XRayTableClickedEvent = ValidateEvent<{
  event: "x-ray_clicked";
  event_detail: "table";
  triggered_from: "homepage" | "browse_database";
}>;

type XRayDataReferenceClickedEvent = ValidateEvent<{
  event: "x-ray_clicked";
  event_detail: "table" | "field" | "segment";
  triggered_from: "data_reference";
}>;

type XRaySuggestionClickedEvent = ValidateEvent<{
  event: "x-ray_clicked";
  event_detail: keyof RelatedDashboardXRays;
  triggered_from: "suggestion_sidebar";
}>;

type XRayAutoInsightsClicked = ValidateEvent<{
  event: "x-ray_automatic_insights_clicked";
  event_detail: "x-ray" | "compare_to_rest";
}>;

type XRayClickedEvent =
  | XRayTableClickedEvent
  | XRayDataReferenceClickedEvent
  | XRaySuggestionClickedEvent
  | XRayAutoInsightsClicked;

type XRaySavedEvent = ValidateEvent<{
  event: "x-ray_saved";
}>;

type XRayEvent = XRayClickedEvent | XRaySavedEvent;

type EmbedWizardEvent =
  | EmbedWizardOpenedEvent
  | EmbedWizardExperienceCompletedEvent
  | EmbedWizardResourceSelectionCompletedEvent
  | EmbedWizardOptionsCompletedEvent
  | EmbedWizardCodeCopiedEvent;

type TableEditingEvent =
  | TableEditingSettingsToggledEvent
  | TableEditButtonClickedEvent;

type MetabotChatOpenedEvent = ValidateEvent<{
  event: "metabot_chat_opened";
  triggered_from:
    | "header"
    | "command_palette"
    | "keyboard_shortcut"
    | "native_editor";
}>;

type MetabotRequestSentEvent = ValidateEvent<{
  event: "metabot_request_sent";
}>;

type MetabotFixQueryClickedEvent = ValidateEvent<{
  event: "metabot_fix_query_clicked";
}>;

type MetabotExplainChartClickedEvent = ValidateEvent<{
  event: "metabot_explain_chart_clicked";
}>;

type MetabotEvent =
  | MetabotChatOpenedEvent
  | MetabotRequestSentEvent
  | MetabotFixQueryClickedEvent
  | MetabotExplainChartClickedEvent;

type RevertVersionEvent = ValidateEvent<{
  event: "revert_version_clicked";
  event_detail: "card" | "dashboard" | "document" | "transform";
}>;

type LearnAboutDataClickedEvent = ValidateEvent<{
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

type MetadataEditEventTriggeredFrom = "admin" | "data_studio";

type MetadataEditEvent = ValidateEvent<{
  event: "metadata_edited";
  event_detail: MetadataEditEventDetail;
  triggered_from: MetadataEditEventTriggeredFrom;
}>;

type BookmarkTableEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "table";
  triggered_from: "collection_list";
}>;

type BookmarkQuestionEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "question";
  triggered_from: "qb_action_panel" | "collection_list";
}>;

type BookmarkModelEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "model";
  triggered_from: "qb_action_panel" | "collection_list";
}>;

type BookmarkMetricEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "metric";
  triggered_from: "qb_action_panel" | "collection_list" | "browse_metrics";
}>;

type BookmarkDashboardEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "dashboard";
  triggered_from: "dashboard_header" | "collection_list";
}>;

type BookmarkCollectionEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "collection";
  triggered_from: "collection_header" | "collection_list";
}>;

type BookmarkDocumentEvent = ValidateEvent<{
  event: "bookmark_added";
  event_detail: "document";
  triggered_from: "collection_list" | "document_header";
}>;

export type RemoteSyncBranchSwitchedEvent = ValidateEvent<{
  event: "remote_sync_branch_switched";
  triggered_from: "admin-settings" | "app-bar";
}>;

type RemoteSyncBranchCreatedEvent = ValidateEvent<{
  event: "remote_sync_branch_created";
  triggered_from: "branch-picker" | "conflict-modal";
}>;

type RemoteSyncPullChangesEvent = ValidateEvent<{
  event: "remote_sync_pull_changes";
  triggered_from: "admin-settings" | "app-bar";
  event_detail?: "force";
}>;

type RemoteSyncPushChangesEvent = ValidateEvent<{
  event: "remote_sync_push_changes";
  triggered_from: "conflict-modal" | "app-bar";
  event_detail?: "force";
}>;

type RemoteSyncSettingsChangedEvent = ValidateEvent<{
  event: "remote_sync_settings_changed";
  triggered_from: "admin-settings" | "data-studio";
}>;

type RemoteSyncDeactivatedEvent = ValidateEvent<{
  event: "remote_sync_deactivated";
  triggered_from: "admin-settings";
}>;

type RemoteSyncEvent =
  | RemoteSyncBranchSwitchedEvent
  | RemoteSyncBranchCreatedEvent
  | RemoteSyncPullChangesEvent
  | RemoteSyncPushChangesEvent
  | RemoteSyncSettingsChangedEvent
  | RemoteSyncDeactivatedEvent;

type BookmarkEvent =
  | BookmarkTableEvent
  | BookmarkQuestionEvent
  | BookmarkModelEvent
  | BookmarkMetricEvent
  | BookmarkDashboardEvent
  | BookmarkCollectionEvent
  | BookmarkDocumentEvent;

type DataStudioOpenedEvent = ValidateEvent<{
  event: "data_studio_opened";
  triggered_from: "nav_menu";
}>;

type DataStudioLibraryCreatedEvent = ValidateEvent<{
  event: "data_studio_library_created";
  target_id: number | null;
}>;

type DataStudioTablePublishedEvent = ValidateEvent<{
  event: "data_studio_table_published";
  target_id: ConcreteTableId | undefined;
}>;

type DataStudioGlossaryCreatedEvent = ValidateEvent<{
  event: "data_studio_glossary_term_created";
  target_id: number | null;
}>;

type DataStudioGlossaryEditedEvent = ValidateEvent<{
  event: "data_studio_glossary_term_updated";
  target_id: number | null;
}>;

type DataStudioGlossaryDeletedEvent = ValidateEvent<{
  event: "data_studio_glossary_term_deleted";
  target_id: number | null;
}>;

type DataStudioTablePickerFiltersAppliedEvent = ValidateEvent<{
  event: "data_studio_table_picker_filters_applied";
}>;

type DataStudioTablePickerFiltersClearedEvent = ValidateEvent<{
  event: "data_studio_table_picker_filters_cleared";
}>;

type DataStudioTablePickerSearchPerformedEvent = ValidateEvent<{
  event: "data_studio_table_picker_search_performed";
}>;

type DataStudioTableUnpublishedEvent = ValidateEvent<{
  event: "data_studio_table_unpublished";
  target_id: ConcreteTableId | undefined;
}>;

type DataStudioBulkSyncSettingsClickedEvent = ValidateEvent<{
  event: "data_studio_bulk_sync_settings_clicked";
}>;

type DataStudioBulkAttributeUpdatedEvent = ValidateEvent<{
  event: "data_studio_bulk_attribute_updated";
  event_detail: "owner" | "layer" | "entity_type" | "data_source";
  result: "success" | "failure";
}>;

type DataStudioTableSchemaSyncedEvent = ValidateEvent<{
  event: "data_studio_table_schema_sync_started";
  result: "success" | "failure";
}>;

type DataStudioTableFieldsRescannedEvent = ValidateEvent<{
  event: "data_studio_table_fields_rescan_started";
  result: "success" | "failure";
}>;

type DataStudioTableFieldValuesDiscardedEvent = ValidateEvent<{
  event: "data_studio_table_field_values_discard_started";
  result: "success" | "failure";
}>;

type MeasureCreateStartedEvent = ValidateEvent<{
  event: "measure_create_started";
  triggered_from: "data_studio_measures_list";
  target_id: number;
}>;

type MeasureCreatedEvent = ValidateEvent<{
  event: "measure_created";
  triggered_from: "data_studio_measures";
  result: "success" | "failure";
  target_id: number | null;
}>;

type SegmentCreateStartedEvent = ValidateEvent<{
  event: "segment_create_started";
  triggered_from: "data_studio_segments" | "admin_datamodel_segments";
  target_id: number | null;
}>;

type SegmentCreatedEvent = ValidateEvent<{
  event: "segment_created";
  triggered_from: "data_studio_segments" | "admin_datamodel_segments";
  result: "success" | "failure";
  target_id: number | null;
}>;

type MetricCreateStartedEvent = ValidateEvent<{
  event: "metric_create_started";
  triggered_from: "browse_metrics" | "data_studio_library" | "command_palette";
}>;

type MetricCreatedEvent = ValidateEvent<{
  event: "metric_created";
  triggered_from: "data_studio" | "main_app";
  result: "success" | "failure";
  target_id: number | null;
}>;

type DataStudioEvent =
  | DataStudioOpenedEvent
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
  | DataStudioTableFieldValuesDiscardedEvent
  | MeasureCreateStartedEvent
  | MeasureCreatedEvent
  | SegmentCreateStartedEvent
  | SegmentCreatedEvent
  | MetricCreateStartedEvent
  | MetricCreatedEvent;

type UnsavedChangesWarningDisplayedEvent = ValidateEvent<{
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
  | MoveToTrashEvent
  | ErrorDiagnosticModalOpenedEvent
  | ErrorDiagnosticModalSubmittedEvent
  | GsheetsConnectionClickedEvent
  | GsheetsImportClickedEvent
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
  | TransformTriggerManualRunEvent
  | TransformJobTriggerManualRunEvent
  | TransformCreatedEvent
  | TransformCreateEvent
  | TransformRunTagsUpdated
  | TransformJobCreatedEvent
  | TransformInspectEvent
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
  | DataStudioEvent
  | UnsavedChangesWarningDisplayedEvent
  | { event: string; [key: string]: unknown };
