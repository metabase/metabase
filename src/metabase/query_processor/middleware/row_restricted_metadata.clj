(ns metabase.query-processor.middleware.row-restricted-metadata
  "Post-processing middleware that drops column metadata derived from rows the current user is not allowed to see.

  A Field's `:fingerprint` is computed at sync time over every row of the table, so it describes the whole column
  rather than any particular caller's row set. When the current user's row access is restricted, the fingerprint
  reveals the bounds and statistics of the rows that are hidden from them, so it is removed from every result column.

  `:results_metadata` is built after this middleware runs: with no fingerprint left on the cols, the insights step
  computes one from the returned rows, so it describes the rows the user got. Such a run must not persist its
  metadata on the Card, where every reader would see it; [[row-restricted?]] is the guard for that."
  (:require
   [metabase.util.match :as match]
   [metabase.util.performance :as perf]))

(defn- sandboxed?
  "Whether a sandbox was applied anywhere in `query`. Same marker
  [[metabase-enterprise.sandbox.query-processor.middleware.sandboxing/merge-sandboxing-metadata]] reads to set
  `:is_sandboxed`."
  [query]
  (boolean (match/match-one query {:query-permissions/sandboxed-table &truthy} true)))

(defn- impersonated?
  "Whether the query runs under a connection-impersonation role, which hands the database a role that filters rows.
  Set by [[metabase-enterprise.impersonation.middleware/apply-impersonation]]."
  [query]
  (some? (:impersonation/role query)))

(defn- db-routed?
  "Whether the query runs against a destination database swapped in by DB routing. The fingerprint was synced from the
  router database, so it describes rows of a database the user does not query at all.
  Set by [[metabase-enterprise.database-routing.middleware/attach-destination-db-middleware]]."
  [query]
  (some? (:destination-database/id query)))

(defn row-restricted?
  "Whether the current user sees only a subset of the rows the query's tables hold."
  [query]
  ;; Every signal is read from the preprocessed query rather than from the dynamic vars the execution middleware binds
  ;; (`*impersonation-role*` and friends): a cached result is replayed from outside those bindings.
  (or (sandboxed? query)
      (impersonated? query)
      (db-routed? query)))

(defn- remove-fingerprints [metadata]
  (update metadata :cols (fn [cols] (perf/mapv #(dissoc % :fingerprint) cols))))

(defn strip-row-restricted-fingerprints
  "Post-processing middleware. Removes `:fingerprint` from every result col when the current user's row access is
  restricted. Must run after every middleware that can add a fingerprint to the cols, which means it goes directly
  above [[metabase.query-processor.middleware.enterprise/merge-sandboxing-metadata]] in the post-processing list:
  that one merges the unrestricted query's metadata, fingerprint included, into the sandboxed results."
  [query rff]
  (if (row-restricted? query)
    (fn strip-row-restricted-fingerprints-rff* [metadata]
      (rff (remove-fingerprints metadata)))
    rff))
