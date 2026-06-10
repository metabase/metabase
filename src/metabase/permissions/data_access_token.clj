(ns metabase.permissions.data-access-token
  "Effective-data-access fingerprint for the *current user* over a set of tables in one database,
  plus the comparison used to decide whether a result blob computed under one user's lens may be
  served to another.

  A cached result (a `stored_result` blob, a cached FieldValues set, etc.) is computed once under
  its creator's effective permissions — sandboxing, connection impersonation, and database
  routing all silently change *which rows* the creator sees. Replaying that blob for another
  viewer is only safe when the viewer's lens is *compatible* with the creator's.

  The token is a per-dimension, per-target map. The convention is **absent = unrestricted**:

      {:sandbox       {table-id <token>}   ; per touched table; absent key => not sandboxed there
       :impersonation {db-id    <token>}   ; absent => not impersonated on that db
       :routing       {db-id    <token>}}  ; absent => sees the router db (admins / __METABASE_ROUTER__)

  Each per-dimension contributor is a `defenterprise` owned by its EE module (OSS => nil, so OSS
  tokens are empty and everyone is compatible). They use `:feature :none` so a sandboxed /
  impersonated / routed user is recognized even if the gating feature flag is momentarily
  unavailable — fail closed, never leak.

  Computing a token may THROW when the user lacks an attribute a routing / impersonation policy
  requires; callers gating a read should treat a throw as \"deny\"."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise sandbox-token-for-table
  "Sandbox fingerprint for the current user on `table-id`, or nil when the user is not sandboxed
  on that table. Captures the GTAP card, its version, and the resolved user-attribute values, so
  two users \"share a sandbox\" only when they'd see the same rows."
  metabase-enterprise.sandbox.models.params.field-values
  [_table-id]
  nil)

(defenterprise impersonation-token-for-db
  "Connection-impersonation fingerprint for the current user on `db-id`, or nil when not
  impersonated (including admins). The token is a map {:role <role-string>} representing the
  resolved database role, or nil when not impersonated."
  metabase-enterprise.impersonation.driver
  [_db-id]
  nil)

(defenterprise routing-token-for-db
  "Database-routing fingerprint for the current user on router `db-id`, or nil when the user
  resolves to the router db itself (admins, or non-admins routed via the __METABASE_ROUTER__
  sentinel). The token is a map {:destination-db-id <db-id>} representing the resolved
  destination database, or nil when the user resolves to the router database itself. May throw when a routed
  non-admin is missing the required routing attribute."
  metabase-enterprise.database-routing.common
  [_db-id]
  nil)

(defn data-access-token
  "Compute the current user's effective-data-access token over `table-ids` in `database-id`.
  See the namespace docstring for the shape. Empty dimensions are omitted; an entirely empty map
  means the user is unrestricted across all three dimensions for this target (the OSS case)."
  [{:keys [database-id table-ids]}]
  (let [sandbox (into {}
                      (keep (fn [table-id]
                              (when-let [t (sandbox-token-for-table table-id)]
                                [table-id t])))
                      table-ids)
        imp     (when database-id (impersonation-token-for-db database-id))
        routing (when database-id (routing-token-for-db database-id))]
    (cond-> {}
      (seq sandbox) (assoc :sandbox sandbox)
      imp           (assoc :impersonation {database-id imp})
      routing       (assoc :routing {database-id routing}))))

(defn data-access-compatible?
  "True when a viewer holding `viewer-token` may be served a blob computed under `creator-token`.

  Per dimension and per target key: the viewer must be **absent** (unrestricted there) OR hold
  the **same** token as the creator. AND'd across every key in either token and across all three
  dimensions. This yields exactly the intended semantics:

    - same sandbox / role / destination     => compatible
    - viewer unsandboxed / unimpersonated / admin (absent) => compatible (sees creator's lens)
    - viewer restricted where creator is not (creator absent, viewer present) => NOT compatible"
  [creator-token viewer-token]
  (every?
   (fn [dimension]
     (let [cm (get creator-token dimension {})
           vm (get viewer-token dimension {})]
       (every? (fn [k]
                 (let [vv (get vm k ::absent)]
                   (or (= vv ::absent)
                       (= vv (get cm k ::absent)))))
               (into #{} (concat (keys cm) (keys vm))))))
   [:sandbox :impersonation :routing]))
