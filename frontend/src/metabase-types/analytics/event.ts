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

export type SimpleEvent =
  | CSVUploadClickedEvent
  | NewsletterToggleClickedEvent
  | OnboardingChecklistOpenedEvent
  | OnboardingChecklistItemExpandedEvent
  | OnboardingChecklistItemCTAClickedEvent;
