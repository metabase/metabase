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

(defn- stored-result->resolved-source-ids
  "The resolved source ids of `stored-result`: those stored with it, else its query's resolved live. nil when
  resolution throws (a deleted card in the source chain) or resolves to nothing: the viewer is denied."
  [{:keys [id dataset_query resolved_source_ids]}]
  (try
    (not-empty (query-perms/query->resolved-source-ids dataset_query resolved_source_ids))
    (catch Exception e
      (log/debugf e "Cached result %s: computing the resolved source ids threw; denying" id)
      nil)))

(defn- verified-source-ids
  "The resolved source ids stored with `stored-result` when they were stamped from its query, `::unverifiable` when
  checking that throws, or nil."
  [{:keys [id dataset_query resolved_source_ids]}]
  (try
    (query-perms/verified-resolved-source-ids dataset_query resolved_source_ids)
    (catch Exception e
      (log/debugf "Cached result %s: computing the resolved source ids threw; denying: %s" id (ex-message e))
      ::unverifiable)))

(defn- live-source-ids-answers
  "The resolved source ids of each of `queries`, or what resolving it throws, by query, resolved together, or nil when
  resolving them together throws an `Exception`, so that each is then resolved on its own."
  [queries]
  (try
    (zipmap queries (query-perms/resolved-source-ids-answers queries))
    (catch Exception e
      (log/debugf "Could not resolve the source ids of %d cached results together: %s" (count queries) (ex-message e))
      nil)))

(defn- stored-results->resolved-source-ids
  "[[stored-result->resolved-source-ids]] of each of `stored-results`, those without a verified stored value resolved
  together."
  [stored-results]
  (let [verified (mapv verified-source-ids stored-results)
        live     (into []
                       (comp (filter (comp nil? first))
                             (map (comp :dataset_query second))
                             (distinct))
                       (map vector verified stored-results))
        resolved (live-source-ids-answers live)]
    (mapv (fn [{:keys [id dataset_query] :as stored-result} verified]
            (let [answer (get resolved dataset_query ::unresolved)]
              (cond
                (= ::unverifiable verified)
                nil

                (some? verified)
                (not-empty verified)

                (= ::unresolved answer)
                (stored-result->resolved-source-ids stored-result)

                (instance? Exception answer)
                (do (log/debugf "Cached result %s: computing the resolved source ids threw; denying: %s"
                                id (ex-message answer))
                    nil)

                (instance? Throwable answer)
                (throw answer)

                :else
                (not-empty answer))))
          stored-results verified)))

(defn- viewer-lens-compatible?
  "True when the current user's effective data-access lens (sandbox / impersonation / routing) is
  compatible with the lens the `stored-result` blob was computed under — i.e. the viewer may be
  served the creator's snapshot. See [[metabase.permissions.data-access-token]]. Only ever reached
  for non-superusers — [[cached-results-blocked-reasons]] passes superusers before any lens check.

  When both the token and the query are present we compare lenses strictly. Two degenerate cases
  make that comparison impossible, and both deny (the viewer here is a non-admin):

    - a `nil` `:data_access_token` — either never captured (the write path fails the query
      rather than persist a token-less snapshot) or stored but unreadable (the model transform
      decodes an unparseable token to nil; see [[metabase.queries.models.stored-result]]).
    - token computation throwing (the viewer is missing a routing/impersonation attribute the
      snapshot's database requires). An expected condition for some viewers — such a viewer could
      not run the query themselves either.

  A missing `:dataset_query` is not a degenerate case but a caller bug — the schema forbids NULL —
  and [[cached-results-blocked-reasons]] throws on it before we get here."
  [stored-result resolved-source-ids data-access-token-reader]
  (if (nil? (:data_access_token stored-result))
    (do
      (log/errorf "Cached result %s has no readable data_access_token (never captured, or failed to parse). Denying."
                  (:id stored-result))
      false)
    (try
      (perms/data-access-compatible?
       (:data_access_token stored-result)
       (data-access-token-reader {:database-id (:database_id stored-result)
                                  :table-ids   (:table-ids resolved-source-ids)}))
      (catch Exception e
        (log/debugf e "Cached result %s: computing the viewer's data-access lens threw; denying"
                    (:id stored-result))
        false))))

(defn- viewer-can-run-underlying-query?
  "Whether the current user holds the data perms to run the snapshot's own query. Only ever reached
  for non-superusers — [[cached-results-blocked-reasons]] passes superusers before any check.

  The check absorbs the ordinary permission-denial `ExceptionInfo`s itself; anything else it
  throws — a stored query malformed enough to trip its `:- :map` schema, a source table that no
  longer exists — must not escape an authorization gate as a 500: deny instead."
  [stored-result resolved-source-ids]
  (try
    (first (query-perms/resolved-query-run-answers [(:dataset_query stored-result)] [resolved-source-ids]))
    (catch Exception e
      (log/debugf e "Cached result %s: the data-perms check threw; denying" (:id stored-result))
      false)))

(defn- viewer-run-answers
  "[[viewer-can-run-underlying-query?]] of each of `stored-results` with the same element of `resolved-source-ids`,
  read for all of them together, or one by one when that throws."
  [stored-results resolved-source-ids]
  (try
    (query-perms/resolved-query-run-answers (mapv :dataset_query stored-results) resolved-source-ids)
    (catch Exception _
      (mapv viewer-can-run-underlying-query? stored-results resolved-source-ids))))

(defn- cached-results-blocked-reasons
  "For each of `stored-results`, nil when the current user may be served its cached blob, else a keyword describing
  why not, with the data perms of all of them read together and, with `share-token-reads?`, their lenses through one
  [[perms/data-access-token-reader]].

  Throws for the first of them that has no `:dataset_query` (this should never happen).

  Superusers pass unconditionally — \"superusers see every exploration\" is a deliberate product
  exemption from the same-lens rule. They hold every data perm, so the bypass skips nothing
  the data-perms check would catch.

  Reasons (in priority order):
    `:no-data-perms`        — current user lacks the data perms required to run the underlying query.
    `:incompatible-context` — current user's sandbox/impersonation/routing lens differs from the
                              lens the snapshot was computed under."
  [stored-results {:keys [data-access-token-reader share-token-reads?]}]
  (doseq [stored-result stored-results]
    (when (nil? (:dataset_query stored-result))
      (throw (ex-info "stored-result is missing its dataset_query"
                      {:stored-result-id (:id stored-result)}))))
  (if api/*is-superuser?*
    (mapv (constantly nil) stored-results)
    (let [resolved                 (stored-results->resolved-source-ids stored-results)
          indexes                  (filterv #(some? (nth resolved %)) (range (count stored-results)))
          runnable                 (zipmap indexes (viewer-run-answers (mapv #(nth stored-results %) indexes)
                                                                       (mapv #(nth resolved %) indexes)))
          data-access-token-reader (cond
                                     data-access-token-reader data-access-token-reader
                                     share-token-reads?       (perms/data-access-token-reader
                                                               (keep (fn [i]
                                                                       (when (get runnable i)
                                                                         {:database-id (:database_id (nth stored-results i))
                                                                          :table-ids   (:table-ids (nth resolved i))}))
                                                                     indexes))
                                     :else                    perms/data-access-token)]
      (mapv (fn [i stored-result resolved-source-ids]
              (cond
                (nil? resolved-source-ids)
                :no-data-perms

                (not (get runnable i))
                :no-data-perms

                (not (viewer-lens-compatible? stored-result resolved-source-ids data-access-token-reader))
                :incompatible-context))
            (range) stored-results resolved))))

(defn cached-result-view-answers
  "Whether the current user may be served the blob of each of `stored-results`, in order, answered together, with
  `opts` as [[cached-results-blocked-reasons]] takes them."
  ([stored-results]
   (cached-result-view-answers stored-results {}))
  ([stored-results opts]
   (mapv nil? (cached-results-blocked-reasons stored-results opts))))

(defn check-can-view-cached-results
  "Throw a 403 for the first of `stored-results` whose cached blob the current user must not see, with their data
  perms read together after the source ids of all of them are resolved, so that an `Error` resolving a later one is
  thrown before an earlier one's 403."
  [stored-results]
  (doseq [[stored-result reason] (map vector stored-results (cached-results-blocked-reasons stored-results {}))
          :when                  reason]
    (throw (ex-info (case reason
                      :no-data-perms        (tru "You do not have permissions to view the data underlying this cached result.")
                      :incompatible-context (tru "Cannot show cached results: your data access differs from the user who generated them.")
                      (tru "You do not have permissions to view this cached result."))
                    {:status-code      403
                     :reason           reason
                     :stored-result-id (:id stored-result)}))))

(defn assert-can-view-cached-result!
  "[[check-can-view-cached-results]] of `stored-result` alone."
  [stored-result]
  (check-can-view-cached-results [stored-result]))

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
