import { trackSimpleEvent } from "metabase/lib/analytics";

import type { FormLocation } from "../../types";
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
