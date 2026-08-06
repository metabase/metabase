(ns metabase.query-processor.referenced-cards
  "Runs the queries a card references for single values (dynamic goals are the first consumer) and injects them into
  the response under `data.referenced_cards`, keyed by card id.

  A referenced query must return exactly one row, narrowed to the requested columns. More than one row fails that
  card, never the main query.

  Referenced queries must run before the main query's QP store is bound: a store holds one database, so a nested run
  against a different one would be rejected."
  (:require
   [clojure.core.async :as a]
   [metabase.api.common :as api]
   [metabase.query-processor :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.util.i18n :refer [tru]]
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

;; two rows rather than one so a card that returns more can be rejected instead of silently truncated. a card with
;; its own `:limit 1` still comes back with one row, which is how you ask for "the first row of a sorted list".
(def ^:private single-value-constraints
  {:max-results 2, :max-results-bare-rows 2})

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
         :constraints single-value-constraints
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
  [{:keys [card_id columns]}]
  (try
    (let [card   (api/read-check (api/check-404 (t2/select-one :model/Card :id card_id)))
          ;; a nested run inside the outer streaming response must return an in-memory map,
          ;; not write to the outer stream
          result (binding [qp.pipeline/*result*        qp.pipeline/default-result-handler
                           qp.pipeline/*canceled-chan* (child-canceled-chan qp.pipeline/*canceled-chan*)]
                   (qp/process-query (referenced-query card)))
          data   (:data result)]
      (if (next (:rows data))
        {:status "failed"
         :error  (tru "Referenced card {0} returned more than one row." card_id)}
        {:status "completed"
         :data   (-> data
                     (perf/select-keys [:cols :rows])
                     (project-columns columns))}))
    (catch Throwable e
      (log/warnf e "Failed to run referenced card %s" card_id)
      {:status "failed"
       :error  (or (ex-message e) (tru "Failed to run referenced query"))})))

(defn- referenced-cards-result
  "Run each spec and return `{card-id-string result}`, nil when there are none. Must run before the main
  query's QP store is bound."
  [specs]
  (when (seq specs)
    (perf/not-empty
     (into {}
           (comp (take max-specs)
                 ;; don't start the next one if the client already hung up
                 (take-while (fn [_] (not (qp.pipeline/canceled?))))
                 (map (fn [{:keys [card_id] :as spec}]
                        ;; string keys so the map serializes to JSON as `{"1": {...}}`
                        [(str card_id) (run-referenced-card spec)])))
           specs))))

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

(defn- ->goal-source
  [goal-value]
  (when (and (map? goal-value) (:card_id goal-value) (:column goal-value))
    (perf/select-keys goal-value [:card_id :column])))

(defn viz-settings->specs
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

(defn maybe-wrap-qp-for-card
  "Derive specs from a card's merged `viz` settings and wrap `qp` to inject their values."
  [qp viz]
  (maybe-wrap-qp qp (viz-settings->specs viz)))
