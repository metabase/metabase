import { t } from "ttag";

import {
  OAUTH_CLIENT_EVENT_TYPES,
  type OAuthClientEventType,
} from "metabase-types/api";

/** What to call an event in a client's history. Shared: the OSS Authorization logs page and Monitor both show it. */
export function getOAuthEventTypeLabel(
  eventType: OAuthClientEventType,
): string {
  switch (eventType) {
    case "registered":
      return t`Registered`;
    case "approved":
      return t`Approved`;
    case "denied":
      return t`Denied`;
    case "revoked":
      return t`Revoked`;
  }
}

export function isOAuthEventType(value: string): value is OAuthClientEventType {
  return OAUTH_CLIENT_EVENT_TYPES.some((eventType) => eventType === value);
}
