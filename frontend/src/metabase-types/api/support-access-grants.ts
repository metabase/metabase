export interface SupportAccessGrant {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email: string | null;
  ticket_number: string | null;
  notes: string | null;
  grant_start_timestamp: string;
  grant_end_timestamp: string;
  revoked_at?: string | null;
  revoked_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSupportAccessGrantRequest {
  grant_duration_minutes: number;
  notes: string | null;
  ticket_number: string | null;
}

export interface ListSupportAccessGrantsRequest {
  "ticket-number"?: string;
  "user-id"?: number;
  "include-revoked"?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListSupportAccessGrantsResponse {
  data: SupportAccessGrant[];
  total: number;
  limit: number;
  offset: number;
}

export type CurrentSupportAccessGrantResponse = SupportAccessGrant | null;
