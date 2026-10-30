(ns metabase.queries.cached-result
  "Read-side helpers for the `stored_result` snapshot table: permission gating,
  deserialization, in-memory sort, and the Dataset-shaped response. The blob was computed
  once by its creator with their effective permissions baked in, so replaying it for any
  other viewer must respect *that viewer's* data permissions and their sandboxing /
  impersonation / database-routing lens — otherwise we'd leak data the QP would have filtered
  out (or fetched from a different database entirely) if the viewer had executed the query
  themselves. The one exemption: superusers may see every snapshot, by product decision.

  The cached blob is served through `POST /api/card/:card-id/query` when the body carries
  a `stored_result_id` — the cardEmbed node tracks the (card, stored_result) pairing and
  the card-query endpoint reuses this namespace for the cached path so callers go through
  one rendering pipeline whether the data is live or cached."
  (:require
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.result-serialization :as qp.result-serialization]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(def allowed-chart-sorts
  "Sort attribute values a cached cardEmbed read is allowed to request. Shared by the
  prompt-builder, the doc validators, and the read-time renderer so the LLM, the doc
  validator, and the renderer agree."
  #{"value_asc" "value_desc" "label_asc" "label_desc"})

(defn- viewer-lens-compatible?
  "True when the current user's effective data-access lens (sandbox / impersonation / routing) is
  compatible with the lens the `stored-result` blob was computed under — i.e. the viewer may be
  served the creator's snapshot. See [[metabase.permissions.data-access-token]]. Only ever reached
  for non-superusers — [[cached-result-blocked-reason]] passes superusers before any lens check.

  When both the token and the query are present we compare lenses strictly. Two degenerate cases
  make that comparison impossible, and both deny (the viewer here is a non-admin):

    - a `nil` `:data_access_token` — either never captured (the write path fails the query
      rather than persist a token-less snapshot) or stored but unreadable (the model transform
      decodes an unparseable token to nil; see [[metabase.queries.models.stored-result]]).
    - token computation throwing (the viewer is missing a routing/impersonation attribute the
      snapshot's database requires, or the query's source-card chain can no longer be resolved to
      its underlying tables). An expected condition for some viewers — such a viewer could not run
      the query themselves either.

  A missing `:dataset_query` is not a degenerate case but a caller bug — the schema forbids NULL —
  and [[cached-result-blocked-reason]] throws on it before we get here."
  [stored-result]
  (if (nil? (:data_access_token stored-result))
    (do
      (log/errorf "Cached result %s has no readable data_access_token (never captured, or failed to parse). Denying."
                  (:id stored-result))
      false)
    (try
      (perms/data-access-compatible?
       (:data_access_token stored-result)
       (perms/data-access-token {:database-id (:database_id stored-result)
                                 :table-ids   (query-perms/query->resolved-source-table-ids
                                               (:dataset_query stored-result))}))
      (catch Exception e
        (log/debugf e "Cached result %s: computing the viewer's data-access lens threw; denying"
                    (:id stored-result))
        false))))

(defn- viewer-can-run-underlying-query?
  "Whether the current user holds the data perms to run the snapshot's own query. Only ever reached
  for non-superusers — [[cached-result-blocked-reason]] passes superusers before any check.

  `can-run-query?` absorbs the ordinary permission-denial `ExceptionInfo`s itself; anything else it
  throws — a stored query malformed enough to trip its `:- :map` schema, a source table that no
  longer exists — must not escape an authorization gate as a 500: deny instead."
  [stored-result]
  (try
    (query-perms/can-run-query? (:dataset_query stored-result))
    (catch Exception e
      (log/debugf e "Cached result %s: the data-perms check threw; denying" (:id stored-result))
      false)))

(defn- cached-result-blocked-reason
  "If the current user must NOT be served the cached blob for `stored-result`, return a keyword
  describing why. Returns nil when the cached blob is safe to stream.

  Throws when `stored-result` has no `:dataset_query` (this should never happen).

  Superusers pass unconditionally — \"superusers see every exploration\" is a deliberate product
  exemption from the same-lens rule. They hold every data perm, so the bypass skips nothing
  the data-perms check would catch.

  Reasons (in priority order):
    `:no-data-perms`        — current user lacks the data perms required to run the underlying query.
    `:incompatible-context` — current user's sandbox/impersonation/routing lens differs from the
                              lens the snapshot was computed under."
  [stored-result]
  (when (nil? (:dataset_query stored-result))
    (throw (ex-info "stored-result is missing its dataset_query"
                    {:stored-result-id (:id stored-result)})))
  (cond
    api/*is-superuser?*
    nil

    (not (viewer-can-run-underlying-query? stored-result))
    :no-data-perms

    (not (viewer-lens-compatible? stored-result))
    :incompatible-context))

(defn viewer-can-view-cached-result?
  "Boolean form of [[assert-can-view-cached-result!]]: true when the current user may be served the
  blob for `stored-result`."
  [stored-result]
  (nil? (cached-result-blocked-reason stored-result)))

(defn assert-can-view-cached-result!
  "Throw a 403 if the current user must not see the cached blob for `stored-result`."
  [stored-result]
  (when-let [reason (cached-result-blocked-reason stored-result)]
    (throw (ex-info (case reason
                      :no-data-perms        (tru "You do not have permissions to view the data underlying this cached result.")
                      :incompatible-context (tru "Cannot show cached results: your data access differs from the user who generated them.")
                      (tru "You do not have permissions to view this cached result."))
                    {:status-code      403
                     :reason           reason
                     :stored-result-id (:id stored-result)}))))

(defn deserialize-cached-result
  "Pull the QP result map out of a worker-serialized blob produced by
  [[metabase.query-processor.result-serialization/do-with-serialization]]. Returns nil when
  the blob is missing or unreadable. Realizes rows fully — the caller may re-sort them in
  memory."
  [^bytes result-bytes]
  (when result-bytes
    (with-open [is (ByteArrayInputStream. result-bytes)]
      (qp.result-serialization/with-reducible-deserialized-results [[qp-result _] is]
        (when qp-result
          (let [data (:data qp-result)]
            (assoc qp-result :data (assoc data :rows (vec (or (:rows data) []))))))))))

(defn- col-index-by-source
  "Index of the first col whose `:source` matches `source` (`:breakout` or `:aggregation`).
  Falls back to `default-idx` when no col carries that source — pre-MLv2 cached blobs may not
  populate `:source` reliably."
  [cols source default-idx]
  (or (->> cols
           (map-indexed (fn [i c]
                          (when (= source (or (:source c) (get c "source"))) i)))
           (some identity))
      default-idx))

(defn apply-sort
  "Re-sort the rows of a deserialized QP result in memory based on `sort` (one of the values
  in [[allowed-chart-sorts]]). The label column is the first `:breakout` col; the value column
  is the first `:aggregation` col. Cached blobs without explicit `:source` fall back to first
  col = label, last col = value. Any throw during sort falls back to the original row order
  with a warning — we never block a read on a sort hiccup."
  [qp-result sort]
  (if (or (nil? sort)
          (not (contains? allowed-chart-sorts sort)))
    qp-result
    (try
      (let [cols      (get-in qp-result [:data :cols])
            rows      (get-in qp-result [:data :rows])
            label-idx (col-index-by-source cols :breakout 0)
            value-idx (col-index-by-source cols :aggregation (max 0 (dec (count cols))))
            idx       (case sort
                        ("value_asc" "value_desc") value-idx
                        ("label_asc" "label_desc") label-idx)
            cmp       (case sort
                        ("value_asc" "label_asc")  compare
                        ("value_desc" "label_desc") u/reverse-compare)
            sorted    (vec (sort-by #(nth % idx nil)
                                    (fn [a b]
                                      (cond
                                        (and (nil? a) (nil? b)) 0
                                        (nil? a) 1
                                        (nil? b) -1
                                        :else    (cmp a b)))
                                    rows))]
        (assoc-in qp-result [:data :rows] sorted))
      (catch Throwable e
        (log/warnf e "apply-sort: failed to apply %s; returning unsorted result" (pr-str sort))
        qp-result))))

(defn cached-dataset
  "Build the Dataset response shape (matching the `/api/card/:id/query` live-path output the
  FE already expects) from a stored_result row and an optional `sort` keyword. Returns nil
  when the blob is missing/unreadable so the caller can 404."
  [stored-result sort]
  (when-let [qp-result (deserialize-cached-result (:result_data stored-result))]
    (let [sorted (apply-sort qp-result sort)
          data   (:data sorted)]
      {:status      "completed"
       :data        data
       :database_id (:database_id stored-result)
       :row_count   (or (:row_count sorted) (count (:rows data)))})))
