(ns metabase.query-processor.referenced-cards
  "Runs the extra queries a chart's dynamic goals reference (e.g. a gauge whose goal is another card's value)
  and injects the values into the response under `data.referenced_cards`: keyed by card id, a single row,
  only the requested columns. Referenced queries run eagerly, before the main query's QP store binds,
  because the store is bound to a single database."
  (:require
   [metabase.api.common :as api]
   [metabase.query-processor :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.util.dynamic-goals :as u.dynamic-goals]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [toucan2.core :as t2]))

(def ^:const max-specs
  "Maximum number of referenced cards honored per request."
  10)

(def specs-schema
  "Schema for the `referenced_cards` request param."
  [:maybe [:sequential {:max max-specs}
           [:map
            [:card_id :int]
            [:columns {:optional true} [:maybe [:sequential :string]]]]]])

(def ^:private single-row-constraints
  {:max-results 1, :max-results-bare-rows 1})

(defn- project-columns
  "Narrow `data` to the requested `columns`, matched by column `:name`."
  [{:keys [cols rows] :as data} columns]
  (if (seq columns)
    (let [cols      (vec cols)
          name->idx (into {} (map-indexed (fn [i col] [(:name col) i])) cols)
          idxs      (into [] (keep name->idx) columns)]
      (assoc data
             :cols (perf/mapv cols idxs)
             :rows (perf/mapv (fn [row] (let [row (vec row)] (perf/mapv row idxs))) rows)))
    data))

(defn- referenced-query
  [{:keys [dataset_query id]}]
  (assoc dataset_query
         :constraints single-row-constraints
         ;; no :executed-by; it'd require a :query-hash for the query remark
         :info {:context :question
                :card-id id}))

(defn- run-referenced-card
  "Never throws: any failure becomes `{:status \"failed\" :error ...}`."
  [{:keys [card_id columns]}]
  (try
    (let [card   (api/read-check (api/check-404 (t2/select-one :model/Card :id card_id)))
          ;; a nested run inside the outer streaming response must return an in-memory map,
          ;; not write to the outer stream
          result (binding [qp.pipeline/*result*        qp.pipeline/default-result-handler
                           qp.pipeline/*canceled-chan* nil]
                   (qp/process-query (referenced-query card)))]
      {:status "completed"
       :data   (-> (:data result)
                   (perf/select-keys [:cols :rows])
                   (project-columns columns))})
    (catch Throwable e
      (log/warnf e "Failed to run referenced card %s" card_id)
      {:status "failed"
       :error  (or (ex-message e) "Failed to run referenced query")})))

(defn- referenced-cards-result
  "Run each spec and return `{card-id-string result}`, nil when there are none. Must run before the main
  query's QP store binds."
  [specs]
  (when (seq specs)
    (into {}
          (map (fn [{:keys [card_id] :as spec}]
                 ;; string keys so the map serializes to JSON as `{"1": {...}}`
                 [(str card_id) (run-referenced-card spec)]))
          (take max-specs specs))))

(defn- inject-referenced-cards
  [rff result]
  (qp.streaming/transforming-query-response
   rff
   (fn [response] (assoc-in response [:data :referenced_cards] result))))

(defn maybe-wrap-rff
  "Run `specs` eagerly and decorate `rff` to inject their values under `data.referenced_cards`."
  [rff specs]
  (if-let [result (referenced-cards-result specs)]
    (inject-referenced-cards rff result)
    rff))

;;; ---------------------------------------------------------------------------------------------------------
;;; Saved-card path: derive specs from a card's viz settings.
;;; ---------------------------------------------------------------------------------------------------------

(defn- maybe-wrap-qp
  "Wrap a qp fn `(fn [query rff])` to inject the results of `specs` under `data.referenced_cards`."
  [qp specs]
  (if-let [result (referenced-cards-result specs)]
    (fn [query rff]
      (qp query (inject-referenced-cards rff result)))
    qp))

(defn viz-settings->specs
  "Extract referenced-card specs from merged viz settings; nil when there are none."
  [viz]
  (let [sources (keep u.dynamic-goals/card-ref (u.dynamic-goals/goal-values viz))]
    (when (seq sources)
      (perf/mapv (fn [[card-id ss]]
                   {:card_id card-id
                    :columns (vec (distinct (map :column ss)))})
                 (group-by :card_id sources)))))

(defn maybe-wrap-qp-for-card
  "Derive specs from a card's merged `viz` settings and wrap `qp` to inject their values."
  [qp viz]
  (maybe-wrap-qp qp (viz-settings->specs viz)))
