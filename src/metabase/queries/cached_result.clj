(ns metabase.queries.cached-result
  "Read-side helpers for the `stored_result` snapshot table: permission gating,
  deserialization, in-memory sort, and the Dataset-shaped response. The blob was computed
  once by its creator with their effective permissions baked in, so replaying it for any
  other viewer must respect *that viewer's* data permissions, sandboxing, and
  impersonation — otherwise we'd leak data the QP would have filtered out if the viewer
  had executed the query themselves.

  The cached blob is served through `POST /api/card/:card-id/query` when the body carries
  a `stored_result_id` — the cardEmbed node tracks the (card, stored_result) pairing and
  the card-query endpoint reuses this namespace for the cached path so callers go through
  one rendering pipeline whether the data is live or cached."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
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

(defn- cached-result-blocked-reason
  "If the current user must NOT be served the cached blob for `stored-result`, return a keyword
  describing why. Returns nil when the cached blob is safe to stream.

  Reasons (in priority order):
    `:sandboxed`     — current user has an enforced sandbox on the snapshot's database.
    `:impersonated`  — current user has connection impersonation on the snapshot's database.
    `:no-data-perms` — current user lacks the data perms required to run the underlying query."
  [stored-result]
  (let [db-id (:database_id stored-result)]
    (cond
      (and db-id (perms/sandboxed-user-for-db? db-id))         :sandboxed
      (and db-id (perms/impersonation-enforced-for-db? db-id)) :impersonated
      (and (:dataset_query stored-result)
           (not (query-perms/can-run-query? (:dataset_query stored-result))))
      :no-data-perms)))

(defn assert-can-view-cached-result!
  "Throw a 403 if the current user must not see the cached blob for `stored-result`."
  [stored-result]
  (when-let [reason (cached-result-blocked-reason stored-result)]
    (throw (ex-info (case reason
                      :sandboxed     (tru "Cannot show cached results: your account is sandboxed for the underlying data.")
                      :impersonated  (tru "Cannot show cached results: connection impersonation is enforced for the underlying data.")
                      :no-data-perms (tru "You do not have permissions to view the data underlying this cached result."))
                    {:status-code      403
                     :reason           reason
                     :stored-result-id (:id stored-result)}))))

(defn deserialize-cached-result
  "Pull the QP result map out of a worker-serialized blob produced by
  [[metabase.query-processor.middleware.cache.impl/do-with-serialization]]. Returns nil when
  the blob is missing or unreadable. Realizes rows fully — the caller may re-sort them in
  memory."
  [^bytes result-bytes]
  (when result-bytes
    (with-open [is (ByteArrayInputStream. result-bytes)]
      (cache.impl/with-reducible-deserialized-results [[qp-result _] is]
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
                        ("value_desc" "label_desc") #(compare %2 %1))
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
