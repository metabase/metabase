import { trackSimpleEvent } from "metabase/lib/analytics";
import type { FormLocation } from "metabase-types/analytics";
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
