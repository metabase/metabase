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
