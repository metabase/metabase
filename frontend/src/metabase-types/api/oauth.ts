import type { PaginationRequest, PaginationResponse } from "./pagination";

export type OAuthClientEventType = "registered" | "approved" | "denied";

/** One row of the OAuth client audit log. Client columns are `null` once the client is deleted. */
export interface OAuthAuthorization {
  id: number;
  oauth_client_id: number | null;
  client_id: string | null;
  /** The deciding user; null for `registered` events. */
  user_id: number | null;
  event_type: OAuthClientEventType;
  created_at: string;
  client_name: string | null;
  client_uri: string | null;
  registration_type: string | null;
  application_type: string | null;
  redirect_uris: string[] | null;
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
}

export type ListOAuthAuthorizationsRequest = {
  "client-id"?: string | null;
  "event-type"?: OAuthClientEventType | null;
} & PaginationRequest;

export type ListOAuthAuthorizationsResponse = {
  data: OAuthAuthorization[];
} & PaginationResponse;
