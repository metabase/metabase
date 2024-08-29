type DashboardEventSchema = {
  event: string;
  dashboard_id: number;
  question_id?: number | null;
  num_tabs?: number | null;
  total_num_tabs?: number | null;
  duration_milliseconds?: number | null;
  section_layout?: string | null;
  full_width?: boolean | null;
  dashboard_accessed_via?: string | null;
};

type ValidateEvent<
  T extends DashboardEventSchema &
    Record<Exclude<keyof T, keyof DashboardEventSchema>, never>,
> = T;

export type DashboardCreatedEvent = ValidateEvent<{
  event: "dashboard_created";
  dashboard_id: number;
}>;

export type DashboardSavedEvent = ValidateEvent<{
  event: "dashboard_saved";
  dashboard_id: number;
  duration_milliseconds: number;
}>;

export type QuestionAddedToDashboardEvent = ValidateEvent<{
  event: "question_added_to_dashboard";
  dashboard_id: number;
  question_id: number;
}>;

export type AutoApplyFiltersDisabledEvent = ValidateEvent<{
  event: "auto_apply_filters_disabled";
  dashboard_id: number;
}>;

export type DashboardTabCreatedEvent = ValidateEvent<{
  event: "dashboard_tab_created";
  dashboard_id: number;
}>;

export type DashboardTabDeletedEvent = ValidateEvent<{
  event: "dashboard_tab_deleted";
  dashboard_id: number;
}>;

export type DashboardTabDuplicatedEvent = ValidateEvent<{
  event: "dashboard_tab_duplicated";
  dashboard_id: number;
}>;

export type NewTextCardCreatedEvent = ValidateEvent<{
  event: "new_text_card_created";
  dashboard_id: number;
}>;

export type NewHeadingCardCreatedEvent = ValidateEvent<{
  event: "new_heading_card_created";
  dashboard_id: number;
}>;

export type NewLinkCardCreatedEvent = ValidateEvent<{
  event: "new_link_card_created";
  dashboard_id: number;
}>;

export type NewActionCardCreatedEvent = ValidateEvent<{
  event: "new_action_card_created";
  dashboard_id: number;
}>;

export type CardSetToHideWhenNoResultsEvent = ValidateEvent<{
  event: "card_set_to_hide_when_no_results";
  dashboard_id: number;
}>;

export type DashboardPdfExportedEvent = ValidateEvent<{
  event: "dashboard_pdf_exported";
  dashboard_id: number;
  dashboard_accessed_via:
    | "internal"
    | "public-link"
    | "static-embed"
    | "interactive-iframe-embed"
    | "sdk-embed";
}>;

export type CardMovedToTabEvent = ValidateEvent<{
  event: "card_moved_to_tab";
  dashboard_id: number;
}>;

export type DashboardCardDuplicatedEvent = ValidateEvent<{
  event: "dashboard_card_duplicated";
  dashboard_id: number;
}>;

export type DashboardCardReplacedEvent = ValidateEvent<{
  event: "dashboard_card_replaced";
  dashboard_id: number;
}>;

export type DashboardSectionAddedEvent = ValidateEvent<{
  event: "dashboard_section_added";
  dashboard_id: number;
  section_layout: string;
}>;

export type DashboardWidthToggledEvent = ValidateEvent<{
  event: "dashboard_width_toggled";
  dashboard_id: number;
  full_width: boolean;
}>;

export type DashboardFilterRequiredEvent = ValidateEvent<{
  event: "dashboard_filter_required";
  dashboard_id: number;
}>;

export type DashboardEvent =
  | DashboardCreatedEvent
  | DashboardSavedEvent
  | QuestionAddedToDashboardEvent
  | AutoApplyFiltersDisabledEvent
  | DashboardTabCreatedEvent
  | DashboardTabDeletedEvent
  | DashboardTabDuplicatedEvent
  | NewTextCardCreatedEvent
  | NewHeadingCardCreatedEvent
  | NewLinkCardCreatedEvent
  | NewActionCardCreatedEvent
  | CardSetToHideWhenNoResultsEvent
  | DashboardPdfExportedEvent
  | CardMovedToTabEvent
  | DashboardCardDuplicatedEvent
  | DashboardCardReplacedEvent
  | DashboardSectionAddedEvent
  | DashboardWidthToggledEvent
  | DashboardFilterRequiredEvent;
