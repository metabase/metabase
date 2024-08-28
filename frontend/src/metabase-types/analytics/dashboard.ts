import type { CardId, DashboardId } from "metabase-types/api";

export type DashboardCreatedEvent = {
  event: "dashboard_created";
  dashboard_id: DashboardId;
};

export type DashboardSavedEvent = {
  event: "dashboard_saved";
  dashboard_id: DashboardId;
  duration_milliseconds: number;
};

export type QuestionAddedToDashboardEvent = {
  event: "question_added_to_dashboard";
  dashboard_id: DashboardId;
  question_id: CardId;
};

export type AutoApplyFiltersDisabledEvent = {
  event: "auto_apply_filters_disabled";
  dashboard_id: DashboardId;
};

export type DashboardTabCreatedEvent = {
  event: "dashboard_tab_created";
  dashboard_id: DashboardId;
};

export type DashboardTabDeletedEvent = {
  event: "dashboard_tab_deleted";
  dashboard_id: DashboardId;
};

export type DashboardTabDuplicatedEvent = {
  event: "dashboard_tab_duplicated";
  dashboard_id: DashboardId;
};

export type NewTextCardCreatedEvent = {
  event: "new_text_card_created";
  dashboard_id: DashboardId;
};

export type NewHeadingCardCreatedEvent = {
  event: "new_heading_card_created";
  dashboard_id: DashboardId;
};

export type NewLinkCardCreatedEvent = {
  event: "new_link_card_created";
  dashboard_id: DashboardId;
};

export type NewActionCardCreatedEvent = {
  event: "new_action_card_created";
  dashboard_id: DashboardId;
};

export type CardSetToHideWhenNoResultsEvent = {
  event: "card_set_to_hide_when_no_results";
  dashboard_id: DashboardId;
};

export type DashboardPdfExportedEvent = {
  event: "dashboard_pdf_exported";
  dashboard_id: DashboardId;
  dashboard_accessed_via:
    | "internal"
    | "public-link"
    | "static-embed"
    | "interactive-iframe-embed"
    | "sdk-embed";
};

export type CardMovedToTabEvent = {
  event: "card_moved_to_tab";
  dashboard_id: DashboardId;
};

export type DashboardCardDuplicatedEvent = {
  event: "dashboard_card_duplicated";
  dashboard_id: DashboardId;
};

export type DashboardCardReplacedEvent = {
  event: "dashboard_card_replaced";
  dashboard_id: DashboardId;
};

export type DashboardSectionAddedEvent = {
  event: "dashboard_section_added";
  dashboard_id: DashboardId;
  section_layout: string;
};

export type DashboardWidthToggledEvent = {
  event: "dashboard_width_toggled";
  dashboard_id: DashboardId;
  full_width: boolean;
};

export type DashboardFilterRequiredEvent = {
  event: "dashboard_filter_required";
  dashboard_id: DashboardId;
};

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
