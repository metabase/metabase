(ns metabase.explorations.models.exploration-query-result
  (:require
   [clojure.edn :as edn]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ExplorationQueryResult [_model]
  :exploration_query_result)

(doto :model/ExplorationQueryResult
  (derive :metabase/model))

(defn- chart-stats-in
  "Encode `compute-chart-stats` output as EDN. JSON would mangle the shape:
  `:chart-type` is a keyword, `:series` is keyed by series-name *strings*,
  and the histogram `:distribution :estimated-percentiles` is keyed by
  *integers* — only EDN round-trips all three."
  [v]
  (cond
    (nil? v)    nil
    (string? v) v
    :else       (pr-str v)))

(defn- chart-stats-out
  "Decode the EDN blob, recovering `nil` (with a warning) on parse failure
  rather than crashing the whole `t2/select`. Bad rows can come from data
  written under an earlier transform (e.g. JSON), or from forward-compat
  scenarios where the writer used types the reader can't parse — neither
  should ever break a read."
  [s]
  (when (string? s)
    (try
      (edn/read-string {:readers {} :default (fn [tag v] [::unknown-tag tag v])} s)
      (catch Throwable e
        (log/warn e "Failed to parse exploration_query_result.chart_stats; returning nil")
        nil))))

(def ^:private transform-encrypted-text
  {:in  encryption/maybe-encrypt
   :out encryption/maybe-decrypt})

(t2/deftransforms :model/ExplorationQueryResult
  {:chart_stats        {:in chart-stats-in :out chart-stats-out}
   :metric_description transform-encrypted-text
   :chart_description  transform-encrypted-text})

(defn stored-results
  "Resolve the cached stored_result for an exploration_query_id via the EQR FK. Returns the
  full stored_result row (creator/db/blob/query) or nil when no result row exists yet (query
  still pending/errored)."
  [eq-id]
  (when-let [sr-id (t2/select-one-fn :stored_result_id :model/ExplorationQueryResult
                                     :exploration_query_id eq-id)]
    (t2/select-one :model/StoredResult :id sr-id)))

(defn- promotion-card-name
  "Pick a stable name for the promoted card. Falls back to the source card's name, then to a
  generic placeholder — the document UI shows the cardEmbed's own `:name` attr anyway, so the
  card name only matters as a backstop / for collection-level views (which won't list these
  cards because `document_id` is set)."
  [eq src-card]
  (or (not-empty (:name eq))
      (not-empty (:name src-card))
      (format "Chart from exploration query %d" (:id eq))))

(defn- deserialize-stored-result
  "Inverse of [[cache.impl/do-with-serialization]] for a stored_result's
  single-frame nippy+gzip blob. Returns nil for missing/unreadable bytes."
  [^bytes result-bytes]
  (when result-bytes
    (with-open [is (ByteArrayInputStream. result-bytes)]
      (cache.impl/with-reducible-deserialized-results [[qp-result _] is]
        qp-result))))

(defn- pick-display+viz-settings
  "Pick the `display` and `visualization_settings` for the materialized Card.
  `graph.dimensions` / `graph.metrics` are derived from the actual qp-result cols (via the
  chart-config) — the source card's viz settings refer to its own breakouts, which differ
  from this query's, so carrying them forward unchanged would point graph.dimensions at a
  column that doesn't exist in this result. Other viz settings (colors, formatting, etc.)
  are inherited from the source Card. Display precedence:
    1. explicit `:display` on the EQ (rarely set)
    2. the chart-config's `:display_type` (line for temporal x, bar otherwise)
    3. the source card's `:display`
    4. `:table` as the last-resort fallback"
  [eq src-card chart-config qp-result]
  (let [cols     (get-in qp-result [:data :cols])
        col-name (fn [src] (some #(when (= src (:source %)) (:name %)) cols))
        dim-name (col-name :breakout)
        met-name (col-name :aggregation)]
    {:display                (or (some-> (:display eq) name)
                                 (some-> (:display_type chart-config) name)
                                 (some-> (:display src-card) name)
                                 "table")
     :visualization_settings (cond-> (or (:visualization_settings eq)
                                         (dissoc (:visualization_settings src-card)
                                                 :graph.dimensions :graph.metrics)
                                         {})
                               dim-name (assoc :graph.dimensions [dim-name])
                               met-name (assoc :graph.metrics    [met-name]))}))

(defn create-card-for-stored-result!
  "Materialize a real `report_card` row that pairs with `stored-result-id` for a single
  document embed. The card carries the display / visualization_settings / dataset_query
  needed to render the snapshot through the standard Card pipeline; the bytes still live on
  `stored_result`. A snapshot can be embedded in multiple documents, each with its own
  Card — the (card_id, stored_result_id) mapping is held by the `cardEmbed` node, not in any
  DB table.

  Caller supplies the target `document-id` (cards belong to the document, not the collection
  browser) and the document's `collection-id` (cards inherit it so perms stay aligned, matching
  the regular doc-card flow in `metabase.documents.api.document/create-cards-for-document!`).
  Display / visualization_settings are recomputed here from the cached qp-result cols + the
  source card's viz settings, so we don't need to persist them anywhere — the snapshot is
  the source of truth. `dataset_query` comes from the originating `exploration_query` snapshot.

  Returns the new `card_id`."
  [stored-result-id document-id collection-id creator]
  (let [sr           (t2/select-one :model/StoredResult :id stored-result-id)
        eqr          (t2/select-one :model/ExplorationQueryResult :stored_result_id stored-result-id)
        eq           (t2/select-one :model/ExplorationQuery :id (:exploration_query_id eqr))
        src-card     (when-let [card-id (:card_id eq)]
                       (t2/select-one [:model/Card :name :description :display :visualization_settings]
                                      :id card-id))
        qp-result    (deserialize-stored-result (:result_data sr))
        chart-config (when qp-result
                       (try (explorations.interestingness/qp-result->chart-config eq qp-result)
                            (catch Throwable _ nil)))
        viz          (pick-display+viz-settings eq src-card chart-config qp-result)
        dataset-query (:dataset_query eq)]
    (query-perms/check-run-permissions-for-query dataset-query)
    (let [card-id (:id (queries/create-card!
                        {:name                   (promotion-card-name eq src-card)
                         :description            (:description src-card)
                         :type                   :question
                         :dashboard_id           nil
                         :dataset_query          dataset-query
                         :display                (:display viz)
                         :visualization_settings (:visualization_settings viz)
                         :document_id            document-id
                         :collection_id          collection-id}
                        creator))]
      ;; Record the (card -> stored_result) reference for lifecycle/GC tracking.
      (t2/insert! :model/StoredResultUse {:stored_result_id stored-result-id :card_id card-id})
      card-id)))
