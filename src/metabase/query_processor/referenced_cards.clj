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
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [toucan2.core :as t2]))

(def ^:const max-specs
  "Maximum number of referenced cards honored per request."
  10)

(def specs-schema
  "Schema for the `referenced_cards` value: up to [[max-specs]] `{:card_id, :columns}` specs."
  [:maybe [:sequential {:max max-specs}
           [:map
            [:card_id :int]
            [:columns {:optional true} [:maybe [:sequential :string]]]]]])

(def ^:private single-row-constraints
  {:max-results 1, :max-results-bare-rows 1})

(defn- project-columns
  "Narrow `data` (`{:cols [...] :rows [...]}`) to the requested `columns` (matched by `:name`), unchanged when
  no columns are requested."
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
  "Build the QP query for a referenced `card` straight from its `dataset_query`, capped to a single row."
  [{:keys [dataset_query id]}]
  (assoc dataset_query
         :constraints single-row-constraints
         ;; no :executed-by: that requires a :query-hash for the query remark, and this isn't a userland run
         :info {:context :question
                :card-id id}))

(defn- run-referenced-card
  "Run one referenced-card spec. Never throws: any failure (missing card, no read permission, query error)
  becomes `{:status \"failed\" :error ...}`."
  [{:keys [card_id columns]}]
  (try
    (let [card   (api/read-check (api/check-404 (t2/select-one :model/Card :id card_id)))
          ;; A nested query run inside another query's streaming response would otherwise write to the outer
          ;; stream; reset the pipeline result handler / cancel channel so it delivers an in-memory map.
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

(defn referenced-cards-result
  "Run each referenced-card spec (capped at [[max-specs]]) and return `{card-id-string result}`, or nil when
  there are no specs. Must be called before the main query's QP store is established."
  [specs]
  (when (seq specs)
    (into {}
          (map (fn [{:keys [card_id] :as spec}]
                 ;; string keys so the map serializes to JSON as `{"1": {...}}`
                 [(str card_id) (run-referenced-card spec)]))
          (take max-specs specs))))

(defn- inject-referenced-cards
  "Decorate `rff` so the response's `:data` gets a `:referenced_cards` key holding `result`."
  [rff result]
  (qp.streaming/transforming-query-response
   rff
   (fn [response] (assoc-in response [:data :referenced_cards] result))))

(defn wrap-rff
  "Eagerly run `specs` and decorate `rff` to add their values under `data.referenced_cards`, or return `rff`
  unchanged when there are no specs. Must be called before [[qp/process-query]] runs the main query."
  [rff specs]
  (if-let [result (referenced-cards-result specs)]
    (inject-referenced-cards rff result)
    rff))

;;; ---------------------------------------------------------------------------------------------------------
;;; Saved-card path: derive specs from a card's viz settings.
;;; ---------------------------------------------------------------------------------------------------------

(defn wrap-qp
  "Wrap a query-processor fn `(fn [query rff])` to inject the results of `specs` under `data.referenced_cards`.
  Run-fn agnostic (every run-fn ultimately calls `(qp query rff)`), so one wrap covers the saved-card,
  dashcard, embed and public endpoints. Returns `qp` unchanged when there are no specs."
  [qp specs]
  (if-let [result (referenced-cards-result specs)]
    (fn [query rff]
      (qp query (inject-referenced-cards rff result)))
    qp))

(defn- ->goal-source
  "A goal that references another card is a `{:card_id ..., :column ...}` map; anything else (a static
  number, a bare column name) is nil."
  [goal-value]
  (when (and (map? goal-value) (:card_id goal-value) (:column goal-value))
    (perf/select-keys goal-value [:card_id :column])))

(defn viz-settings->specs
  "Extract referenced-card specs from merged `viz` settings: card references in `:graph.goal_value` and in
  the `:min`/`:max` of `:gauge.segments` / `:scalar.segments` entries, grouped by card id. Nil when there
  are none."
  [viz]
  (let [segments (concat (:gauge.segments viz) (:scalar.segments viz))
        sources  (keep ->goal-source
                       (cons (:graph.goal_value viz)
                             (mapcat (juxt :min :max) segments)))]
    (when (seq sources)
      (perf/mapv (fn [[card-id ss]]
                   {:card_id card-id
                    :columns (vec (distinct (map :column ss)))})
                 (group-by :card_id sources)))))

(defn wrap-qp-for-card
  "Saved-card hook: derive referenced-card specs from a card's merged `viz` settings and wrap `qp` to inject
  their values. Returns `qp` unchanged when there are no dynamic references."
  [qp viz]
  (wrap-qp qp (viz-settings->specs viz)))
