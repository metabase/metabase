# Plan: Remote Sync "Has Remote Changes" Endpoint

## Goal

Create a new endpoint that checks if there are changes on the remote (Git) repository that can be pulled, with in-memory caching to avoid excessive Git operations.

## Current State

- Remote-sync endpoints are defined in `enterprise/backend/src/metabase_enterprise/remote_sync/api.clj`
- Version tracking exists via `remote-sync.task/last-version` (returns last successfully synced Git SHA)
- Remote version can be fetched via `source.p/version` on a snapshot
- Currently, remote changes are only detected during export (to prevent overwriting)
- **No endpoint exists to check for remote changes without attempting a sync**

## Design Decisions

- **Never imported before**: Return `has_changes: true` (there is content to pull)
- **Remote unreachable**: Let error propagate (consistent with other endpoints)
- **Branch changed**: Reset cache when branch setting changes
- **Change summary**: Not included - endpoint only returns boolean and versions

## Implementation Steps

### Step 1: Add Cache Atom and TTL Setting

**File:** `enterprise/backend/src/metabase_enterprise/remote_sync/impl.clj`

Add an atom-based cache for storing remote change check results:

```clojure
(def ^:private remote-changes-cache
  "Cache for remote changes check to avoid frequent git operations.
   Structure: {:last-checked-ms <timestamp>
               :branch <branch-name>
               :remote-version <git-sha>
               :has-changes? <boolean>}"
  (atom nil))
```

**File:** `enterprise/backend/src/metabase_enterprise/remote_sync/settings.clj`

Add a configurable TTL setting:

```clojure
(defsetting remote-sync-check-changes-cache-ttl-seconds
  (deferred-tru "Time-to-live in seconds for the remote changes check cache. Default is 60 seconds.")
  :type :integer
  :visibility :admin
  :export? false
  :encryption :no
  :default 60)
```

### Step 2: Implement Core Logic

**File:** `enterprise/backend/src/metabase_enterprise/remote_sync/impl.clj`

Add function to check for remote changes with caching:

```clojure
(defn has-remote-changes?
  "Check if remote has new changes compared to last imported version.
   Uses cache to avoid frequent git operations. Returns map with:
   - :has-changes? boolean
   - :remote-version string (git SHA)
   - :local-version string (git SHA of last import, or nil)
   - :cached? boolean (whether result came from cache)

   Cache is invalidated if:
   - TTL has expired
   - Branch setting has changed
   - force-refresh? is true"
  ([]
   (has-remote-changes? nil))
  ([{:keys [force-refresh?]}]
   (let [cache-state @remote-changes-cache
         now-ms (System/currentTimeMillis)
         ttl-ms (* 1000 (settings/remote-sync-check-changes-cache-ttl-seconds))
         current-branch (settings/remote-sync-branch)
         cache-valid? (and cache-state
                           (not force-refresh?)
                           (= current-branch (:branch cache-state))
                           (< (- now-ms (:last-checked-ms cache-state)) ttl-ms))]
     (if cache-valid?
       (assoc cache-state :cached? true)
       (let [last-imported (remote-sync.task/last-version)
             source (source/source-from-settings current-branch)
             snapshot (source.p/snapshot source)
             current-remote (source.p/version snapshot)
             ;; has-changes? is true if:
             ;; - never imported (last-imported is nil), OR
             ;; - remote version differs from local version
             has-changes? (or (nil? last-imported)
                              (not= last-imported current-remote))
             result {:last-checked-ms now-ms
                     :branch current-branch
                     :remote-version current-remote
                     :local-version last-imported
                     :has-changes? has-changes?}]
         (reset! remote-changes-cache result)
         (assoc result :cached? false))))))

(defn invalidate-remote-changes-cache!
  "Invalidate the remote changes cache. Call this after import/export."
  []
  (reset! remote-changes-cache nil))
```

### Step 3: Invalidate Cache on Import/Export

**File:** `enterprise/backend/src/metabase_enterprise/remote_sync/impl.clj`

Modify `async-import!` and `async-export!` to invalidate cache on success:

```clojure
;; At the end of successful import in async-import!
(invalidate-remote-changes-cache!)

;; At the end of successful export in async-export!
(invalidate-remote-changes-cache!)
```

### Step 4: Add Response Schema

**File:** `enterprise/backend/src/metabase_enterprise/remote_sync/schema.clj`

```clojure
(def HasRemoteChangesResponse
  "Response schema for the has-remote-changes endpoint."
  [:map
   [:has_changes :boolean]
   [:remote_version [:maybe :string]]
   [:local_version [:maybe :string]]
   [:cached :boolean]])
```

### Step 5: Add API Endpoint

**File:** `enterprise/backend/src/metabase_enterprise/remote_sync/api.clj`

```clojure
(api.macros/defendpoint :get "/has-remote-changes" :- schema/HasRemoteChangesResponse
  "Check if there are new changes on the remote branch that can be pulled.
   Uses in-memory caching (configurable TTL via remote-sync-check-changes-cache-ttl-seconds setting).

   Returns:
   - has_changes: true if remote version differs from last imported version, or if never imported
   - remote_version: current Git SHA on remote branch
   - local_version: Git SHA of last successful import (nil if never imported)
   - cached: true if result was served from cache"
  [_route-params
   _query-params
   {:keys [force_refresh] :or {force_refresh false}} :- [:map [:force_refresh {:optional true} :boolean]]]
  (api/check-superuser)
  (api/check-400 (settings/remote-sync-enabled) (tru "Remote sync is not configured."))
  (let [result (impl/has-remote-changes? {:force-refresh? force_refresh})]
    {:has_changes (:has-changes? result)
     :remote_version (:remote-version result)
     :local_version (:local-version result)
     :cached (:cached? result)}))
```

### Step 6: Add Tests

**File:** `enterprise/backend/test/metabase_enterprise/remote_sync/api_test.clj`

Add tests for:
1. Endpoint returns `has_changes: true` when never imported
2. Endpoint returns `has_changes: true` when remote version differs
3. Endpoint returns `has_changes: false` when versions match
4. Cache is used on subsequent calls within TTL
5. `force_refresh=true` bypasses cache
6. Cache is invalidated when branch changes
7. Cache is invalidated after import
8. Cache is invalidated after export
9. Endpoint requires superuser
10. Endpoint returns 400 if remote-sync not configured

## API Contract

### Request

```
GET /api/ee/remote-sync/has-remote-changes
GET /api/ee/remote-sync/has-remote-changes?force_refresh=true
```

**Headers:** Requires superuser authentication

**Query Parameters:**
- `force_refresh` (optional, boolean): If true, bypass cache and check remote

### Response

```json
{
  "has_changes": true,
  "remote_version": "abc123def456...",
  "local_version": "789xyz...",
  "cached": false
}
```

**Fields:**
- `has_changes`: `true` if there are changes to pull (or never imported), `false` if up-to-date
- `remote_version`: Current Git SHA on the remote branch
- `local_version`: Git SHA of last successful import (`null` if never imported)
- `cached`: `true` if this result came from cache, `false` if freshly fetched

**Status Codes:**
- `200`: Success
- `400`: Remote sync not configured
- `401`: Not authenticated
- `403`: Not superuser

## Files to Modify

1. `enterprise/backend/src/metabase_enterprise/remote_sync/settings.clj` - Add TTL setting
2. `enterprise/backend/src/metabase_enterprise/remote_sync/impl.clj` - Add cache and logic
3. `enterprise/backend/src/metabase_enterprise/remote_sync/schema.clj` - Add response schema
4. `enterprise/backend/src/metabase_enterprise/remote_sync/api.clj` - Add endpoint
5. `enterprise/backend/test/metabase_enterprise/remote_sync/api_test.clj` - Add tests
