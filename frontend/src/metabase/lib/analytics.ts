import * as Snowplow from "@snowplow/browser-tracker";

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
  event: "1-0-0",
};

export function trackEvent(event: SimpleEvent) {
  trackSchemaEvent("event", event);
}

export function trackSchemaEvent(schema: SchemaType, event: SchemaEvent): void {
  if (Settings.trackingEnabled() && Settings.snowplowEnabled()) {
    Snowplow.trackSelfDescribingEvent({
      event: {
        schema: `iglu:com.metabase/${schema}/jsonschema/${VERSIONS[schema]}`,
        data: event,
      },
    });
  }
}
