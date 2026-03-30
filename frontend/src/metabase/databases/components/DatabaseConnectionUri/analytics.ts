import { trackSimpleEvent } from "metabase/lib/analytics";
import type { ValidateEvent } from "metabase-types/analytics/event";

import type { FormLocation } from "../../types";

type ConnectionStringParsedSuccessEvent = ValidateEvent<{
  event: "connection_string_parsed_success";
  triggered_from: FormLocation;
}>;

type ConnectionStringParsedFailedEvent = ValidateEvent<{
  event: "connection_string_parsed_failed";
  triggered_from: FormLocation;
}>;

declare module "metabase-types/analytics/event" {
  interface SimpleEventExtensions {
    connectionStringParsedSuccess: ConnectionStringParsedSuccessEvent;
    connectionStringParsedFailed: ConnectionStringParsedFailedEvent;
  }
}
export function connectionStringParsedSuccess(location: FormLocation) {
  trackSimpleEvent({
    event: "connection_string_parsed_success",
    triggered_from: location,
  });
}

export function connectionStringParsedFailed(location: FormLocation) {
  trackSimpleEvent({
    event: "connection_string_parsed_failed",
    triggered_from: location,
  });
}
