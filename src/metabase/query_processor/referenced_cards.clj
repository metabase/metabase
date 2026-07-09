(ns metabase.query-processor.referenced-cards
  "THROW-AWAY backend implementation for the \"Dynamic goals\" project (GDGT-2789).

  Implements Option 5 from the tech doc: query-executing endpoints run a set of *referenced* queries
  (e.g. the card + column that supplies a Gauge chart's dynamic goal/range) and add the computed values
  to the response under `data.referenced_cards`.

    {:data {:cols [...] :rows [...]
            :referenced_cards {\"1\" {:status \"completed\"
                                    :data   {:cols [...] :rows [[123 456]]}}
                               \"2\" {:status \"failed\"
                                    :error  \"...\"}}}}

  Two ways referenced cards are supplied:

  * POST `/api/dataset` (ad-hoc questions) passes them explicitly in the request body as
    `referenced_cards` (see [[metabase.query-processor.api]]).
  * Saved-card endpoints (2-8) derive them from the card's (merged) `visualization_settings`: any
    `GoalSource` reference (`{:card_id, :column}`) found in `:graph.goal_value`, or in the `:min`/`:max`
    of `:gauge.segments` / `:scalar.segments` entries. A plain number (static goal) or a bare string
    (self-column reference, à la Progress bar) is not a referenced card. See [[viz-settings->specs]].

  Referenced queries are executed *eagerly*, before the main query's QP store/metadata-provider is
  established, because a nested [[metabase.query-processor/process-query]] against a different database
  would clash with the outer store (see [[metabase.query-processor.store/validate-existing-provider]]).

  This is deliberately minimal and is expected to be thrown away once the FE contract is settled."
  (:require
   [metabase.api.common :as api]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [toucan2.core :as t2]))

(def specs-schema
  "Malli schema for the `referenced_cards` request/viz-setting value: a list of `{card_id, columns}` specs."
  [:maybe [:sequential [:map
                        [:card_id :int]
                        [:columns {:optional true} [:maybe [:sequential :string]]]]]])

(def ^:private single-row-constraints
  "Referenced queries only ever need their first row, so cap them to a single row."
  {:max-results 1, :max-results-bare-rows 1})

(defn- project-columns
  "Narrow `data` (`{:cols [...] :rows [...]}`) to just the requested `columns` (matched by `:name`).
  Returns `data` unchanged when no columns are requested."
  [{:keys [cols rows] :as data} columns]
  (if (seq columns)
    (let [cols      (vec cols)
          name->idx (into {} (map-indexed (fn [i col] [(:name col) i])) cols)
          idxs      (into [] (keep name->idx) columns)]
      (assoc data
             ;; `cols`/`row` are vectors used as index functions over `idxs`.
             :cols (perf/mapv cols idxs)
             :rows (perf/mapv (fn [row] (let [row (vec row)] (perf/mapv row idxs))) rows)))
    data))

(defn- run-referenced-card
  "Run the query for a single referenced card spec, returning a result map. Never throws: any failure
  (missing card, no read permission, query error, ...) is captured as `{:status \"failed\" :error ...}`."
  [{:keys [card_id columns]}]
  (try
    (let [card   (api/read-check (api/check-404 (t2/select-one :model/Card :id card_id)))
          query  (qp.card/query-for-card card [] single-row-constraints nil)
          ;; This may run inside another query's streaming response, which rebinds the pipeline result
          ;; handler / cancel channel to write to the *outer* stream. Reset them so this nested query
          ;; delivers its result normally as an in-memory map instead of clobbering the outer response.
          result (binding [qp.pipeline/*result*        qp.pipeline/default-result-handler
                           qp.pipeline/*canceled-chan* nil]
                   (qp/process-query query))]
      {:status "completed"
       :data   (-> (:data result)
                   (perf/select-keys [:cols :rows])
                   (project-columns columns))})
    (catch Throwable e
      (log/warnf e "Failed to run referenced card %s" card_id)
      {:status "failed"
       :error  (or (ex-message e) "Failed to run referenced query")})))

(defn referenced-cards-result
  "Run every referenced query in `specs` and return a map of `card_id` -> result map. Returns `nil` when
  there are no specs (so callers can `if-let` on it). Must be called *before* the main query's QP store
  is established."
  [specs]
  (when (seq specs)
    ;; Key by the card id as a *string* so the map serializes cleanly to JSON (`{\"1\": {...}}`).
    (into {} (map (fn [{:keys [card_id] :as spec}]
                    [(str card_id) (run-referenced-card spec)]))
          specs)))

(defn- inject-referenced-cards
  "Decorate `rff` so the completed response's `:data` gets a `:referenced_cards` key holding `result`."
  [rff result]
  (qp.streaming/transforming-query-response
   rff
   (fn [response] (assoc-in response [:data :referenced_cards] result))))

(defn wrap-rff
  "Eagerly compute referenced-card results for `specs` and decorate `rff` so they are added to the response
  under `data.referenced_cards`. Returns `rff` unchanged when there are no specs. Used by POST /api/dataset
  (ad-hoc questions). MUST be called before [[metabase.query-processor/process-query]] runs for the main
  query."
  [rff specs]
  (if-let [result (referenced-cards-result specs)]
    (inject-referenced-cards rff result)
    rff))

(defn wrap-qp
  "Given a base query-processor fn `(fn [query rff])` and referenced-card `specs`, return a qp that injects
  the referenced-card results under `data.referenced_cards`.

  This is `:make-run`-agnostic: every run-fn (default, and the public/embed variants) ultimately calls
  `(qp query rff)`, so wrapping the qp covers the saved-card, dashcard, embed and public card endpoints
  from the single seam in [[metabase.query-processor.card/process-query-for-card]].

  The referenced queries run eagerly when this is called, which MUST be before the outer card query's QP
  store is established. Returns `qp` unchanged when there are no specs."
  [qp specs]
  (if-let [result (referenced-cards-result specs)]
    (fn [query rff]
      (qp query (inject-referenced-cards rff result)))
    qp))

(defn- ->goal-source
  "If `goal-value` is a `GoalSource` reference (a map with `:card_id` and `:column`), return it; otherwise
  nil (a static number, or a bare-string self-column reference — neither runs an extra query)."
  [goal-value]
  (when (and (map? goal-value) (:card_id goal-value) (:column goal-value))
    (select-keys goal-value [:card_id :column])))

(defn viz-settings->specs
  "Extract referenced-card specs from a card's (merged) `viz` settings per the dynamic-goals contract:
  `GoalSource` references found in `:graph.goal_value`, and in the `:min`/`:max` of each `:gauge.segments`
  / `:scalar.segments` entry. Returns specs grouped by card id as `[{:card_id N :columns [...]}]` (the
  shape [[referenced-cards-result]] expects), or nil when there are no dynamic references."
  [viz]
  (let [segments (concat (:gauge.segments viz) (:scalar.segments viz))
        sources  (keep ->goal-source
                       (cons (:graph.goal_value viz)
                             (mapcat (juxt :min :max) segments)))]
    (when (seq sources)
      (mapv (fn [[card-id ss]]
              {:card_id card-id
               :columns (vec (distinct (map :column ss)))})
            (group-by :card_id sources)))))

(defn wrap-qp-for-card
  "Central hook for the saved-card / dashcard / embed / public endpoints (2-8): derive referenced-card
  specs from a card's merged `viz` settings (see [[viz-settings->specs]]) and wrap `qp` to inject their
  values under `data.referenced_cards`. Returns `qp` unchanged when there are no dynamic references."
  [qp viz]
  (wrap-qp qp (viz-settings->specs viz)))
