export type DataAppId = number;

/**
 * A data app materialized from the connected repository. The repo's
 * `data_apps/<dir>/data_app.yml` files are discovered on sync; one row exists
 * per app and the bundle is cached in the app DB and served at `/apps/:name`.
 * The repository itself is configured via the remote-sync settings.
 */
export interface DataApp {
  id: DataAppId;
  /** Stable slug from the app's `data_app.yml`; also the URL segment. */
  name: string;
  display_name: string;
  /** Path within the repo to the built bundle. */
  bundle_path: string;
  /** Admin toggle. When false the app is not served. */
  enabled: boolean;
  /**
   * External origins the app's sandboxed bundle may `fetch`/XHR, from its
   * `data_app.yml`. Empty means none (Metabase data still flows through the
   * SDK). Each entry is an origin, optionally with a `*.` wildcard.
   */
  allowed_hosts: string[];
  /** SHA-256 of the cached bundle; `null` until the first successful sync. */
  bundle_hash: string | null;
  /** Git commit the cached bundle was synced from; `null` until first sync. */
  last_synced_sha: string | null;
  /** ISO timestamp of the last successful sync; `null` if never synced. */
  last_synced_at: string | null;
  /** Message from this app's most recent failed sync; `null` when it succeeded. */
  sync_error: string | null;
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
