import type { Table } from "metabase-types/api";

export const EVENT_TABLE_ENTITY_TYPE = "entity/EventTable";

export const isEventTable = (table: Pick<Table, "entity_type">): boolean =>
  table.entity_type === EVENT_TABLE_ENTITY_TYPE;

/** Names for the schemas sync's event schema classifier recognizes. */
const EVENT_SCHEMA_NAMES: Record<string, string> = {
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- names the event tracker, not this app
  "metabase-track": "Metabase Track",
  snowplow: "Snowplow",
  ga4: "Google Analytics 4",
  amplitude: "Amplitude",
  segment: "Segment",
  posthog: "PostHog",
  mixpanel: "Mixpanel",
};

/** The name of the known event schema sync matched the table to, if any. */
export const getDetectedEventSchemaName = (
  table: Table | undefined,
): string | undefined => {
  const schema = table?.detected_event_settings?.schema;
  return schema !== undefined
    ? (EVENT_SCHEMA_NAMES[schema] ?? schema)
    : undefined;
};
