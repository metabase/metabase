import type {
  ChecklistItemCTA,
  ChecklistItemValue,
} from "metabase/home/components/Onboarding/types";

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
  | ErrorDiagnosticModalSubmittedEvent;
