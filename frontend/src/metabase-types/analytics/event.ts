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

// Iglu URI for the simple_event schema. Defined here (next to the event types)
// so the SDK bundle can import it without pulling in the main-app analytics module.
export const SIMPLE_EVENT_SCHEMA_URI =
  "iglu:com.metabase/simple_event/jsonschema/1-0-0";

export type EmbeddingSdkInitializedEvent = ValidateEvent<{
  event: "embedding_sdk_initialized";
  event_detail: string;
}>;

export type EmbeddingSdkComponentRenderedEvent = ValidateEvent<{
  event: "embedding_sdk_component_rendered";
  event_detail: string;
}>;

export type EmbeddingSdkEvent =
  | EmbeddingSdkInitializedEvent
  | EmbeddingSdkComponentRenderedEvent;
