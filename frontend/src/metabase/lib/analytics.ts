import * as Snowplow from "@snowplow/browser-tracker";

import { shouldLogAnalytics } from "metabase/env";
import Settings from "metabase/lib/settings";
import type {
  SchemaEvent,
  SchemaType,
  SimpleEvent,
} from "metabase-types/analytics";

export * from "./analytics-untyped";

type SchemaVersion = `${number}-${number}-${number}`;

const VERSIONS: Record<SchemaType, SchemaVersion> = {
  account: "1-0-2",
  action: "1-0-0",
  browse_data: "1-0-0",
  cleanup: "1-0-1",
  csvupload: "1-0-3",
  dashboard: "1-1-5",
  database: "1-0-1",
  downloads: "1-0-0",
  embed_flow: "1-0-3",
  embed_share: "1-0-1",
  embedded_analytics_js: "2-0-0",
  embedding_homepage: "1-0-0",
  simple_event: "1-0-0",
  invite: "1-0-1",
  model: "1-0-0",
  question: "1-0-6",
  search: "1-1-2",
  serialization: "1-0-1",
  settings: "1-0-2",
  setup: "1-0-3",
  timeline: "1-0-0",
  upsell: "1-0-0",
};

export function trackSimpleEvent(event: SimpleEvent) {
  trackSchemaEvent("simple_event", event);
}

export function trackSchemaEvent(schema: SchemaType, event: SchemaEvent): void {
  const shouldSendEvent =
    Settings.trackingEnabled() && Settings.snowplowEnabled();

  if (shouldLogAnalytics) {
    const { event: type, ...other } = event;
    // eslint-disable-next-line no-console
    console.log(
      `%c[SNOWPLOW EVENT | event sent:${shouldSendEvent}]%c, ${type}`,
      // eslint-disable-next-line metabase/no-color-literals
      "background: #222; color: #bada55",
      "color: ",
      other,
    );
  }

  if (shouldSendEvent) {
    Snowplow.trackSelfDescribingEvent({
      event: {
        schema: `iglu:com.metabase/${schema}/jsonschema/${VERSIONS[schema]}`,
        data: event,
      },
    });
  }
}
