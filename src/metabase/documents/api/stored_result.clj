(ns metabase.documents.api.stored-result
  "`/api/document/stored-result/` routes — serve a cached `stored_result` blob to FE consumers
  (the static `cardEmbed` node-view) as a Card-shaped envelope."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.documents.result-data :as result-data]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(mr/def ::StoredResultResponse
  "Card-shaped envelope so the FE can feed it directly into the same Visualization pipeline used
  by saved-card embeds. `id` is nil because no real Card exists; the FE treats this as an inline
  question."
  [:map
   [:card    :map]
   [:dataset :map]])

(defn- deserialize-cached-result
  "Pull the QP result map out of a worker-serialized blob produced by
  [[metabase.query-processor.middleware.cache.impl/do-with-serialization]]. Returns nil when the
  blob is missing or unreadable. Realizes rows fully — the caller may re-sort them in memory."
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

(defn- apply-sort
  "Re-sort the rows of a deserialized QP result in memory based on `sort` (one of the values in
  [[result-data/allowed-chart-sorts]]). The label column is the first `:breakout` col; the value
  column is the first `:aggregation` col. Cached blobs without explicit `:source` fall back to
  first col = label, last col = value. Any throw during sort falls back to the original row order
  with a warning — we never block a read on a sort hiccup."
  [qp-result sort]
  (if (or (nil? sort)
          (not (contains? result-data/allowed-chart-sorts sort)))
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

(defn- envelope
  "Card-shaped envelope assembled from the stored_result row. The dataset uses the
  `\"completed\"` status the FE expects for a finished QP result."
  [stored-result qp-result]
  {:card    {:id                     nil
             :name                   nil
             :display                (or (:display stored-result) :table)
             :visualization_settings (or (:visualization_settings stored-result) {})
             :dataset_query          (:dataset_query stored-result)
             :database_id            (:database_id stored-result)
             :type                   "question"}
   :dataset {:status    "completed"
             :data      (:data qp-result)
             :row_count (or (:row_count qp-result)
                            (count (get-in qp-result [:data :rows] [])))}})

(api.macros/defendpoint :get "/:id" :- ::StoredResultResponse
  "Return a card-shaped envelope (`{card, dataset}`) for a cached `stored_result`. The `sort`
  query param (one of `value_asc`, `value_desc`, `label_asc`, `label_desc`) re-orders the rows
  in memory before returning. The FE node-view for static `cardEmbed` feeds this response
  straight into the same `Visualization` rendering used by live `cardEmbed`."
  [{:keys [id]}   :- [:map [:id ms/PositiveInt]]
   {:keys [sort]} :- [:map
                      [:sort {:optional true}
                       [:maybe [:enum "value_asc" "value_desc" "label_asc" "label_desc"]]]]]
  (let [sr (api/check-404 (t2/select-one :model/StoredResult :id id))]
    (when-not (= api/*current-user-id* (:creator_id sr))
      (result-data/assert-can-view-cached-result! sr))
    (let [qp-result (api/check-404 (deserialize-cached-result (:result_data sr)))]
      (envelope sr (apply-sort qp-result sort)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/document/stored-result/` routes."
  (api.macros/ns-handler *ns* +auth))
