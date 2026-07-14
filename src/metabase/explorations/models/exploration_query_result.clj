(ns metabase.explorations.models.exploration-query-result
  (:require
   [clojure.edn :as edn]
   [metabase.api.common :as api]
   [metabase.explorations.composite :as composite]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.core :as qp]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [tru]]
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

(defn- deserialize-stored-result
  "Inverse of [[qp/do-with-serialization]] for a stored_result's
  single-frame nippy+gzip blob. Returns nil for missing/unreadable bytes."
  [^bytes result-bytes]
  (when result-bytes
    (with-open [is (ByteArrayInputStream. result-bytes)]
      (qp/with-reducible-deserialized-results [[qp-result _] is]
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

(defn exploration-query-id-for-stored-result
  "Resolve the `exploration_query_id` that produced `stored-result-id` (via its EQR row), or nil
  when no result row references the snapshot.

  Used by the AI summary materializer to map an LLM-emitted `stored_result_id` back to the EQ id
  that [[create-ephemeral-card-for-exploration-queries!]] keys on; that call then returns the
  resolved `:primary-eq` for building the chart deep link, so no second EQ fetch is needed here."
  [stored-result-id]
  (t2/select-one-fn :exploration_query_id :model/ExplorationQueryResult
                    :stored_result_id stored-result-id))

(defn- serialize-qp-result
  "Run `qp/do-with-serialization` on a single in-memory qp-result and return the
  gzipped+nippy byte array. The qp-result here comes from `composite/combine`, which
  builds on top of already-deserialised source snapshots — the `prepare-for-serialization`
  step the task runner does on a fresh QP result isn't needed (no metadata-provider atoms
  to strip), since whatever was strippable was already stripped at write time."
  ^bytes [qp-result]
  (qp/do-with-serialization
   (fn [in result-fn]
     (in qp-result)
     (result-fn))))

(defn- load-eq-results
  "For each `eq-id`, resolve the `{:eq … :eqr … :sr … :qp-result …}` map. Asserts the EQ
  exists and its stored_result_id is set + the snapshot bytes deserialise. Order is
  preserved from `eq-ids` — that ordering drives the composite snapshot row order."
  [eq-ids]
  (mapv
   (fn [eq-id]
     (let [eq        (api/check-404 (t2/hydrate (t2/select-one :model/ExplorationQuery :id eq-id)
                                                :segment_name))
           eqr       (api/check-404 (t2/select-one :model/ExplorationQueryResult
                                                   :exploration_query_id eq-id))
           sr        (api/check-404 (t2/select-one :model/StoredResult :id (:stored_result_id eqr)))
           qp-result (api/check-404 (deserialize-stored-result (:result_data sr)))]
       {:eq eq :eqr eqr :sr sr :qp-result qp-result}))
   eq-ids))

(defn- compose-display+viz-settings
  "Resolve the `display` + `visualization_settings` to bake onto the ephemeral card.

  Precedence per field:
    1. FE-sent value (`display-override` / `visualization-settings-override`).
    2. The legacy recompute from `pick-display+viz-settings` (kept as a fallback for the
       rare gap where the FE doesn't supply both — e.g. static or AI-driven callers).

  The composite qp-result + first EQ's source card supply enough context for the
  fallback path to behave like the pre-composite single-query flow used to."
  [composite-qp-result first-eq src-card display-override visualization-settings-override]
  (let [chart-config (when composite-qp-result
                       (try
                         (explorations.interestingness/qp-result->chart-config first-eq composite-qp-result)
                         (catch Throwable _ nil)))
        fallback     (pick-display+viz-settings first-eq src-card chart-config composite-qp-result)]
    {:display                (or display-override (:display fallback))
     :visualization_settings (or visualization-settings-override (:visualization_settings fallback))}))

(defn create-ephemeral-card-for-exploration-queries!
  "Materialise an ephemeral `report_card` that represents a *composite chart* — possibly
  built from multiple `ExplorationQuery` snapshots combined into one — for a single document
  embed.

  - `eq-ids`         Non-empty seq of `ExplorationQuery` ids; their stored_result snapshots
                     are combined by `metabase.explorations.composite/combine` into one
                     composite qp-result. The first id supplies metadata fallbacks (source
                     card, dataset_query). A multi-id combine is persisted as a brand-new
                     `stored_result` row; a single id reuses the source snapshot as-is (no
                     duplicate row).
  - `document-id`    Target document — the materialised card is scoped to it (`document_id`
                     set + `collection_id` matched), which keeps it out of the regular
                     collection-browser / data-picker pickers.
  - `collection-id`  The document's collection (cards inherit perms).
  - `creator`        Current user.
  - opts             `:display` / `:visualization-settings` — FE-computed values from
                     `buildSeries` / `getDisplay`. When supplied they're baked onto the card
                     verbatim. Either can be nil — the gap is filled by the legacy
                     `pick-display+viz-settings` recompute.

  For a multi-id combine, inserts a `StoredResultUse` row for the new composite snapshot plus
  one per source stored_result, so GC of any source cascades through. For a single id, inserts
  the one row tying the card to the (reused) source snapshot.

  Returns a map `{:card-id … :stored-result-id … :primary-eq …}` — `stored-result-id` is the
  new composite row for a combine, or the source snapshot id for a single-query embed;
  `primary-eq` is the first source `ExplorationQuery` (hydrated `:segment_name`), handed back so
  callers can build the chart deep link without re-fetching it."
  [eq-ids document-id collection-id creator
   {:keys [display visualization-settings]}]
  (let [eq-results      (load-eq-results eq-ids)
        first-eq        (:eq (first eq-results))
        first-sr        (:sr (first eq-results))
        src-card        (when-let [card-id (:card_id first-eq)]
                          (t2/select-one [:model/Card :name :description :display :visualization_settings]
                                         :id card-id))
        composite-qp    (composite/combine eq-results (or visualization-settings {}))
        composed        (compose-display+viz-settings
                         composite-qp first-eq src-card display visualization-settings)
        dataset-query   (:dataset_query first-eq)
        creator-id      (:id creator)]
    (query-perms/check-run-permissions-for-query dataset-query)
    ;; Single-query embeds reuse the source snapshot as-is — `composite/combine` returned it
    ;; unchanged, so copying its bytes into a fresh stored_result would just duplicate them.
    ;; Only a genuine multi-snapshot combine produces new cols/rows that need their own row.
    (let [single?         (= 1 (count eq-results))
          composite-bytes (when-not single? (serialize-qp-result composite-qp))]
      (t2/with-transaction [_conn]
        (let [stored-result-id (if single?
                                 (:id first-sr)
                                 (first (t2/insert-returning-pks!
                                         :model/StoredResult
                                         {:result_data   composite-bytes
                                          :creator_id    creator-id
                                          :database_id   (or (:database_id first-sr)
                                                             (-> dataset-query :database))
                                          :dataset_query dataset-query})))
              card-id          (:id (queries/create-card!
                                     {:name                   (or (not-empty (:name first-eq))
                                                                  (not-empty (:name src-card))
                                                                  (tru "Chart"))
                                      :description            (:description src-card)
                                      :type                   :question
                                      :dashboard_id           nil
                                      :dataset_query          dataset-query
                                      :display                (:display composed)
                                      :visualization_settings (:visualization_settings composed)
                                      :document_id            document-id
                                      :collection_id          collection-id}
                                     creator))]
          ;; Record the (card -> stored_result) refs for lifecycle/GC tracking. For a combine we
          ;; reference the new composite snapshot plus every source, so a delete of any source
          ;; cascades; for a single-query embed the snapshot *is* the source, so one row covers it.
          (t2/insert! :model/StoredResultUse {:stored_result_id stored-result-id :card_id card-id})
          (when-not single?
            (doseq [{:keys [sr]} eq-results]
              (t2/insert! :model/StoredResultUse {:stored_result_id (:id sr) :card_id card-id})))
          {:card-id card-id :stored-result-id stored-result-id :primary-eq first-eq})))))
