import * as Snowplow from "@snowplow/browser-tracker";

import { shouldLogAnalytics } from "metabase/env";
import Settings from "metabase/lib/settings";
import type {
  SchemaEvent,
  SchemaType,
  SimpleEvent,
} from "metabase-types/analytics";

export * from "./analytics-untyped";

const VERSIONS: Record<SchemaType, string> = {
  account: "1-0-2",
  action: "1-0-0",
  browse_data: "1-0-0",
  cleanup: "1-0-0",
  csvupload: "1-0-3",
  dashboard: "1-1-4",
  database: "1-0-1",
  embed_flow: "1-0-1",
  embed_share: "1-0-0",
  embedding_homepage: "1-0-0",
  event: "1-0-0",
  invite: "1-0-1",
  metabot: "1-0-1",
  model: "1-0-0",
  question: "1-0-5",
  search: "1-1-0",
  serialization: "1-0-1",
  settings: "1-0-2",
  setup: "1-0-3",
  timeline: "1-0-0",
  upsell: "1-0-0",
};

export function trackEvent(event: SimpleEvent) {
  trackSchemaEvent("event", event);
}

export function trackSchemaEvent(schema: SchemaType, event: SchemaEvent): void {
  if (Settings.trackingEnabled() && Settings.snowplowEnabled()) {
    if (shouldLogAnalytics) {
      const { event: type, ...other } = event;
      // eslint-disable-next-line no-console
      console.log(
        `%c[SNOWPLOW EVENT]%c, ${type}`,
        "background: #222; color: #bada55",
        "color: ",
        other,
      );
    }

    Snowplow.trackSelfDescribingEvent({
      event: {
        schema: `iglu:com.metabase/${schema}/jsonschema/${VERSIONS[schema]}`,
        data: event,
      },
    });
  }
}
