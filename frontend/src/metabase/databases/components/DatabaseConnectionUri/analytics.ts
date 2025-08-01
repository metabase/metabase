import { trackSimpleEvent } from "metabase/lib/analytics";

export function connectionStringParsedSuccess(
  location: "admin" | "setup" | "embedding_setup",
) {
  trackSimpleEvent({
    event: "connection_string_parsed_success",
    triggered_from: location,
  });
}

export function connectionStringParsedFailed(
  location: "admin" | "setup" | "embedding_setup",
) {
  trackSimpleEvent({
    event: "connection_string_parsed_failed",
    triggered_from: location,
  });
}
