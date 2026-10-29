export interface SdkReact18Host {
  id: number;
  /** `null` when the host app page URL has no hostname. */
  host: string | null;
  created_at: string;
  last_seen_at: string;
}
