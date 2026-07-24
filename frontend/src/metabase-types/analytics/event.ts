export type SimpleEventSchema = {
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

export type CustomVizPluginCreatedEvent = ValidateEvent<{
  event: "custom_viz_plugin_created";
  result: "success" | "failure";
}>;

export type CustomVizPluginUpdatedEvent = ValidateEvent<{
  event: "custom_viz_plugin_updated";
  result: "success" | "failure";
}>;

export type CustomVizPluginDeletedEvent = ValidateEvent<{
  event: "custom_viz_plugin_deleted";
}>;

export type CustomVizPluginToggledEvent = ValidateEvent<{
  event: "custom_viz_plugin_toggled";
  event_detail: "enabled" | "disabled";
}>;

export type CustomVizPluginRefreshedEvent = ValidateEvent<{
  event: "custom_viz_plugin_refreshed";
}>;

export type CustomVizSelectedEvent = ValidateEvent<{
  event: "custom_viz_selected";
}>;

export type CustomVizEvent =
  | CustomVizPluginCreatedEvent
  | CustomVizPluginUpdatedEvent
  | CustomVizPluginDeletedEvent
  | CustomVizPluginToggledEvent
  | CustomVizPluginRefreshedEvent
  | CustomVizSelectedEvent;

export type AiSetupStartedEvent = ValidateEvent<{
  event: "ai_setup_started";
  triggered_from: "setup";
}>;

export type AiProviderConnectedEvent = ValidateEvent<{
  event: "ai_provider_connected";
  triggered_from: "setup";
  event_detail: string | null;
}>;

export type AiSetupLaterClickedEvent = ValidateEvent<{
  event: "ai_setup_later_clicked";
  triggered_from: "setup";
}>;

export type UserInvitedEvent = ValidateEvent<{
  event: "user_invited";
  triggered_from: "admin" | "setup" | "dashboard" | "question";
  target_id: number | null;
  result: "success" | "failure";
  event_detail: "new_user" | "existing_user" | null;
}>;

export type InviteToViewOpenedEvent = ValidateEvent<{
  event: "invite_to_view_opened";
  triggered_from: "dashboard" | "question";
  target_id: number | null;
}>;

export type MonitorOpenedEvent = ValidateEvent<{
  event: "monitor_opened";
  triggered_from: "nav_menu";
}>;

export type MonitorSectionClickedEvent = ValidateEvent<{
  event: "monitor_section_clicked";
  event_detail:
    | "diagnostics"
    | "erroring-questions"
    | "alerts"
    | "tasks"
    | "jobs"
    | "logs"
    | "model-caching";
}>;
