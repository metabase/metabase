export type DataAppId = number;

/**
 * A data app: its manifest fields, plus a bundle cached in the app DB and
 * served at `/apps/:name`.
 */
export interface DataApp {
  id: DataAppId;
  /** Stable identifier shared by the app's copies across instances. */
  entity_id: string;
  /** The app's slug. */
  name: string;
  display_name: string;
  /** Optional one-line summary of what the app does. */
  description: string | null;
  /** Data app contract version the app was built for; 1 when the manifest declares none. */
  version: number;
  /**
   * Whether `version` is older than the one this Metabase serves. Admin-only:
   * regular users never receive an outdated app.
   */
  outdated: boolean;
  /** Path to the built bundle, relative to the app's directory. */
  bundle_path: string;
  /** Admin toggle. When false the app is not served. */
  enabled: boolean;
  /** The collection that contains this app's saved questions and models. */
  resource_collection_id: number;
  /** The group that grants users access to this data app. */
  permission_group_id: number | null;
  /** Tables used by the last successful resource synchronization. */
  table_ids: number[];
  /** Whether any app member lacks access to a table used by this app. */
  has_user_permission_warnings?: boolean;
  /**
   * External origins the app's sandboxed bundle may `fetch`/XHR. Empty means
   * none (Metabase data still flows through the SDK). Each entry is an origin,
   * optionally with a `*.` wildcard.
   */
  allowed_hosts: string[];
  /** SHA-256 of the cached bundle; `null` while the app has none. */
  bundle_hash: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Status of the connected repository as it relates to data apps. The connection
 * itself (URL / branch / token) is configured on the remote-sync settings page.
 */
export interface DataAppRepoStatus {
  /** Whether a repository is connected via remote-sync. */
  configured: boolean;
  /** The connected repository URL, or `null` when none is connected. */
  url: string | null;
}

export interface SetDataAppEnabledRequest {
  /** The app's slug. */
  name: string;
  enabled: boolean;
}

export interface DataAppMissingTable {
  id: number;
  name: string;
  schema: string | null;
  database_id: number;
  database_name: string;
}

export interface DataAppUserPermissionWarning {
  user_id: number;
  missing_tables: DataAppMissingTable[];
}

export interface GetDataAppUserPermissionWarningsRequest {
  name: string;
  user_ids: number[];
}
