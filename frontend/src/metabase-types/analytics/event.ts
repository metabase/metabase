import type {
  ChecklistItemCTA,
  ChecklistItemValue,
} from "metabase/home/components/Onboarding/types";
import type { KeyboardShortcutId } from "metabase/palette/shortcuts";

type SimpleEventSchema = {
  event: string;
  target_id?: number | null;
  triggered_from?: string | null;
  duration_ms?: number | null;
  result?: string | null;
  event_detail?: string | null;
};

type ValidateEvent<
  T extends SimpleEventSchema &
    Record<Exclude<keyof T, keyof SimpleEventSchema>, never>,
> = T;

type CSVUploadClickedEvent = ValidateEvent<{
  event: "csv_upload_clicked";
  triggered_from: "left-nav";
}>;

export type DatabaseAddClickedEvent = ValidateEvent<{
  event: "database_add_clicked";
  triggered_from: "left-nav" | "db-list";
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
    | "snippet";
}>;

export type ErrorDiagnosticModalOpenedEvent = ValidateEvent<{
  event: "error_diagnostic_modal_opened";
  triggered_from: "profile-menu" | "command-palette";
}>;

export type ErrorDiagnosticModalSubmittedEvent = ValidateEvent<{
  event: "error_diagnostic_modal_submitted";
  event_detail: "download-diagnostics" | "submit-report";
}>;

export type GsheetsConnectionClickedEvent = ValidateEvent<{
  event: "sheets_connection_clicked";
  triggered_from: "db-page" | "left-nav";
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
        | "viz_type_changed"
        | "datasource_removed"
        | "datasource_added"
        | "column_removed"
        | "column_added";
      event_data: string | null;
      triggered_from: "visualizer-modal";
    }
>;

export type SimpleEvent =
  | CSVUploadClickedEvent
  | DatabaseAddClickedEvent
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
  | VisualizerModalEvent;
