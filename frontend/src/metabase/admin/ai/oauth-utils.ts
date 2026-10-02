import { t } from "ttag";

import {
  OAUTH_CLIENT_EVENT_TYPES,
  type OAuthClientEventType,
} from "metabase-types/api";

export const OAUTH_PAGE_SIZE = 50;

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
