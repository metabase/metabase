import { t } from "ttag";

import type { OAuthClientEventType } from "metabase-types/api";

export const OAUTH_PAGE_SIZE = 50;

export const OAUTH_EVENT_TYPES: OAuthClientEventType[] = [
  "registered",
  "approved",
  "denied",
];

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
  }
}
