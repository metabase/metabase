(ns metabase.query-processor.referenced-cards
  "Runs the queries a card references and injects their values into the response under `data.referenced_cards`,
  keyed by card id.

  A card that returns more rows than its caller asked for fails that card, never the main query.

  Referenced queries must run before the main query's QP store is bound: a store holds one database, so a nested run
  against a different one would be rejected.

  The runner knows nothing about what the specs are for. One row is the dynamic-goal consumer's requirement, not the
  runner's, so it's declared in the second section below along with the rest of the goal-aware code."
  (:require
   [clojure.core.async :as a]
   [metabase.api.common :as api]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]))

;;; ---------------------------------------------------------------------------------------------------------
;;; Running the specs. Generic: a spec is `{:card_id, :columns, :max_rows}`, whatever produced it.
;;; ---------------------------------------------------------------------------------------------------------

(def specs-schema
  "Schema for the `referenced_cards` request param."
  [:maybe [:sequential
           [:map
            [:card_id :int]
            [:columns {:optional true} [:maybe [:sequential :string]]]
            ;; referencing a card shouldn't yield more rows than querying it directly would
            [:max_rows {:optional true}
             [:maybe [:and
                      [:int {:min 1}]
                      [:fn {:error/message "cannot exceed the unaggregated query row limit"}
                       #(<= % (:max-results-bare-rows (qp.constraints/default-query-constraints)))]]]]]]])

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
  [{:keys [dataset_query id]} max-rows]
  (assoc dataset_query
         ;; one over the limit, so a card returning too much can be rejected instead of silently truncated. a card
         ;; with its own `:limit` under this still comes back short, which is how you ask for "the first N rows".
         :constraints {:max-results (inc max-rows), :max-results-bare-rows (inc max-rows)}
         ;; no :executed-by; it'd require a :query-hash for the query remark
         :info {:context :question
                :card-id id}))

(defn- child-canceled-chan
  "Cancel chan for a nested run: cancellation flows down from `parent`, but the nested run finishing can't close
  `parent` (see [[qp.pipeline/*reduce*]]) and leave the main query uncancelable."
  [parent]
  (let [child (a/promise-chan)]
    (when parent
      (a/go (when-some [v (a/<! parent)]
              (a/>! child v))))
    child))

(defn- run-referenced-card
  "Never throws: any failure becomes `{:status \"failed\" :error ...}`."
  [{:keys [card_id columns max_rows]} default-max-rows]
  (let [max-rows (or max_rows default-max-rows)]
    (try
      (let [card   (api/read-check :model/Card card_id)
            ;; a nested run inside the outer streaming response must return an in-memory map,
            ;; not write to the outer stream
            result (binding [qp.pipeline/*result*        qp.pipeline/default-result-handler
                             qp.pipeline/*canceled-chan* (child-canceled-chan qp.pipeline/*canceled-chan*)]
                     (qp/process-query (referenced-query card max-rows)))
            data   (:data result)]
        (if (> (count (:rows data)) max-rows)
          (do
            (log/warnf "Referenced card %s returned more than the requested %s row(s)" card_id max-rows)
            {:status "failed"
             :error  (tru "Referenced card {0} returned more rows than the requested maximum of {1}." card_id max-rows)})
          {:status "completed"
           :data   (-> data
                       (perf/select-keys [:cols :rows])
                       (project-columns columns))}))
      (catch Throwable e
        (log/warnf e "Failed to run referenced card %s" card_id)
        {:status "failed"
         :error  (or (ex-message e) (tru "Failed to run referenced query"))}))))

(defn- referenced-cards-result
  "Run each spec and return `{card-id-string result}`, nil when there are none. Must run before the main
  query's QP store is bound."
  [specs max-rows]
  (when (seq specs)
    (perf/not-empty
     (into {}
           (comp ;; don't start the next one if the client already hung up
            (take-while (fn [_] (not (qp.pipeline/canceled?))))
            (map (fn [{:keys [card_id] :as spec}]
                   ;; string keys so the map serializes to JSON as `{"1": {...}}`
                   [(str card_id) (run-referenced-card spec max-rows)])))
           specs))))

(defn- inject-referenced-cards
  [rff result]
  (qp.streaming/transforming-query-response
   rff
   (fn [response] (assoc-in response [:data :referenced_cards] result))))

(defn- maybe-wrap-qp
  "Wrap a qp fn `(fn [query rff])` to inject the results of `specs` under `data.referenced_cards`."
  [qp specs max-rows]
  (if-let [result (referenced-cards-result specs max-rows)]
    (fn [query rff]
      (qp query (inject-referenced-cards rff result)))
    qp))

;;; ---------------------------------------------------------------------------------------------------------
;;; The dynamic-goals consumer: both entry points, plus reading goal sources out of a saved card's viz
;;; settings. The only goal-aware code here. Gets productionized in GDGT-2826.
;;; ---------------------------------------------------------------------------------------------------------

(def ^:private goal-max-rows
  "A goal is a single value, so its card must produce one row."
  1)

(defn maybe-wrap-rff-for-goals
  "Run `specs` eagerly and decorate `rff` to inject their values under `data.referenced_cards`."
  [rff specs]
  (if-let [result (referenced-cards-result specs goal-max-rows)]
    (inject-referenced-cards rff result)
    rff))

(defn- ->goal-source
  [goal-value]
  (when (and (map? goal-value) (:card_id goal-value) (:column goal-value))
    (perf/select-keys goal-value [:card_id :column])))

(defn viz-settings->goal-specs
  "Extract referenced-card specs from merged viz settings; nil when there are none."
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

(defn maybe-wrap-qp-for-goals
  "Derive specs from a card's merged `viz` settings and wrap `qp` to inject their values."
  [qp viz]
  (maybe-wrap-qp qp (viz-settings->goal-specs viz) goal-max-rows))
