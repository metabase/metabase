(ns metabase.query-processor.referenced-entities
  "Runs the queries a card references and injects their values into the response under `data.referenced_entities`,
  keyed by entity type and then by id.

  An entity that returns more rows than its caller asked for fails that entity, never the main query. So does one whose
  query reads parameters, since it would run with no values for them.

  Each referenced query runs under its own QP store ([[qp.store/with-fresh-store]]): otherwise a nested run reuses
  the main query's store and can't resolve tables on a different database.

  The runner knows nothing about what the specs are for. One row is the dynamic-goal consumer's requirement, not the
  runner's, so it's declared in the second section below along with the rest of the goal-aware code."
  (:require
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   ;; only to escape the caller's store, so a referenced entity on another database can open its own
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.template-tags :as qp.template-tags]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]
   [metabase.visualization-settings.dynamic-goals :as dynamic-goals]))

;;; ---------------------------------------------------------------------------------------------------------
;;; Running the specs. Generic: a spec is `{:type, :id, :columns, :max_rows}`, whatever produced it.
;;; ---------------------------------------------------------------------------------------------------------

(def ^:private entity-types
  "Model and the key its runnable query lives under, per referenced entity type."
  {"card"    {:model :model/Card,    :query-key :dataset_query}
   "measure" {:model :model/Measure, :query-key :definition}})

(def ^:private max-specs
  "Cap on how many entities one request can ask for. A chart needs a handful; anything past this is a client bug
  or an attempt to fan one request out into many warehouse queries."
  20)

(def specs-schema
  "Schema for the `referenced_entities` request param."
  [:maybe [:sequential {:max max-specs}
           [:map {:closed true}
            [:type (into [:enum] (keys entity-types))]
            [:id :int]
            [:columns {:optional true} [:maybe [:sequential :string]]]
            ;; referencing an entity shouldn't yield more rows than querying it directly would
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
  "`query` set up to run as a referenced entity: limited to `max-rows` + 1 rows, and recorded as a QueryExecution
  under the `:dynamic-goal` context."
  [query entity-type id max-rows {:keys [parent-info ignore-cached-results?]}]
  (-> query
      (assoc
       ;; one over the limit, so an entity returning too much can be rejected instead of silently truncated. a
       ;; query with its own `:limit` under this still comes back short, which is how you ask for "the first N".
       :constraints {:max-results (inc max-rows), :max-results-bare-rows (inc max-rows)}
       ;; otherwise a card source's id makes this run overwrite that card's result_metadata, and a metric's
       ;; stripped breakouts would erase its dimension columns
       :middleware {:skip-results-metadata? true
                    ;; a refresh of the chart refreshes its goals too
                    :ignore-cached-results? (boolean ignore-cached-results?)})
      (dissoc :info)
      (qp/userland-query (cond-> (merge {:executed-by api/*current-user-id*
                                         :context     :dynamic-goal}
                                        parent-info)
                           ;; :card-id ends up in the QueryExecution row and the warehouse query remark, so a
                           ;; measure must not borrow the key
                           (= entity-type "card") (assoc :card-id id)))))

(defn- runnable-query
  "The query to run for `entity`. A metric's breakouts group it for display; a reference wants its value, so
  they come off. Filters and joins stay, they define what the metric measures."
  [entity query-key]
  (let [query (query-key entity)]
    (if-not (= :metric (:type entity))
      query
      (let [query (lib/query (lib-be/application-database-metadata-provider (:database query)) query)]
        (cond-> query
          (lib/mbql-stage? query -1) lib/remove-all-breakouts)))))

(defn- run-isolated
  "Run `query` while another query is running, returning its result map rather than streaming it. A `card-id` gets
  that card's saved-question permission check."
  [query card-id]
  (qp.store/with-fresh-store
    ;; own cancel chan: a finished query closes its chan, so sharing one would stop cancels reaching the main query
    ;; or a later goal
    (qp.pipeline/do-with-own-canceled-chan
     (fn []
       ;; in-memory result: a nested run inside the outer streaming response must not write to the outer stream
       (binding [qp.pipeline/*result* qp.pipeline/default-result-handler
                 ;; a referenced card is a saved question, so reading it is enough. unbound, the perms check takes
                 ;; the ad-hoc branch and demands create-queries on its tables. measures have no equivalent yet, so
                 ;; they stay on the ad-hoc branch.
                 qp.perms/*card-id*   card-id]
         (qp/process-query query))))))

(defn- run-referenced-entity
  "Never throws: any failure becomes `{:status \"failed\" :error ...}`. `parent-info` is the `:info` of the query
  referencing the entity. `cache-strategy-fn` picks a referenced card's cache strategy from the card and its query;
  measures run uncached."
  [{entity-type :type, :keys [id columns max_rows]} default-max-rows
   {:keys [parent-info cache-strategy-fn ignore-cached-results?]}]
  (let [max-rows (or max_rows default-max-rows)
        card?    (= entity-type "card")
        {:keys [model query-key]} (entity-types entity-type)]
    (try
      ;; passes for anything under the public and embed paths' `as-admin`, so there the spec's producer must
      ;; already have checked that the reference is readable
      (let [entity (api/read-check model id)]
        ;; it runs with no parameter values, so it'd get each one's default or none at all. a measure has neither
        ;; parameters nor a `:dataset_query`
        (if (qp.template-tags/reads-parameters? entity)
          (do
            (log/warnf "Referenced %s %s reads parameters, so it can't run on its own" entity-type id)
            {:status     "failed"
             :error_type "has-parameters"
             :error      (tru "Referenced {0} {1} uses variables, so it can''t run on its own." entity-type id)})
          (let [query          (referenced-query (runnable-query entity query-key) entity-type id max-rows
                                                 {:parent-info            (perf/select-keys parent-info
                                                                                            [:dashboard-id :pulse-id])
                                                  :ignore-cached-results? ignore-cached-results?})
                ;; measures have no cache config of their own. computed on the final query, since its hash (which
                ;; the strategy's average execution time is looked up by) covers the constraints
                cache-strategy (when (and card? cache-strategy-fn)
                                 (cache-strategy-fn entity query))
                result         (run-isolated (cond-> query cache-strategy (assoc :cache-strategy cache-strategy))
                                             (when card? id))
                data           (:data result)]
            (cond
              ;; a userland run returns its failure instead of throwing it
              (not= :completed (:status result))
              {:status "failed"
               :error  (or (:error result) (tru "Failed to run referenced query"))}

              (> (count (:rows data)) max-rows)
              (do
                (log/warnf "Referenced %s %s returned more than the requested %s row(s)" entity-type id max-rows)
                {:status     "failed"
                 :error_type "too-many-rows"
                 :error      (tru "Referenced {0} {1} returned more rows than the requested maximum of {2}."
                                  entity-type id max-rows)})

              :else
              {:status "completed"
               :data   (-> data
                           (perf/select-keys [:cols :rows])
                           (project-columns columns))}))))
      (catch Throwable e
        (log/warnf e "Failed to run referenced %s %s" entity-type id)
        {:status "failed"
         :error  (or (ex-message e) (tru "Failed to run referenced query"))}))))

(defn- dedupe-specs
  "One spec per entity. Results are keyed by entity, so a client naming the same one twice would otherwise run it
  twice and throw the first result away."
  [specs]
  (perf/mapv (fn [[[entity-type id] ss]]
               {:type     entity-type
                :id       id
                ;; a spec with no :columns wants them all, so it wins over one that narrows
                :columns  (when (perf/every? (comp seq :columns) ss)
                            (vec (distinct (mapcat :columns ss))))
                :max_rows (when-let [ms (seq (keep :max_rows ss))]
                            (apply max ms))})
             (group-by (juxt :type :id) specs)))

(defn- specs-result
  "`(entity-result spec)` for each deduped spec, as `{type-string {id-string result}}`; nil when there are none."
  [specs entity-result]
  (perf/not-empty
   (reduce (fn [acc {entity-type :type, :keys [id] :as spec}]
             ;; string keys so the map serializes to JSON as `{"card": {"1": {...}}}`
             (assoc-in acc [entity-type (str id)] (entity-result spec)))
           {}
           ;; don't start the next one if the client already hung up
           (take-while (fn [_] (not (qp.pipeline/canceled?))) specs))))

(defn- refused-entity
  [entity-type id message]
  (log/warnf "Refused referenced %s %s: %s" entity-type id message)
  {:status "failed"
   :error  message})

(defn- refusals
  "`check-entities`'s refusals for `specs`. If the check throws, every spec is refused: an unchecked
  reference must not run, and a failed check must not fail the main query."
  [check-entities specs]
  (try
    (check-entities specs)
    (catch Throwable e
      (log/error e "Failed to check referenced entities; refusing them all")
      (let [message (tru "Could not check whether this reference may be used.")]
        (into {} (map (fn [{entity-type :type, :keys [id]}] [[entity-type id] message])) specs)))))

(defn- referenced-entities-result
  "Run each spec and return `{type-string {id-string result}}`, nil when there are none. `check-entities`, when given,
  returns `{[type id] message}` for the deduped specs that may not run; those fail with that message instead of
  running. `run-opts` goes to each run (see [[run-referenced-entity]])."
  [specs max-rows check-entities run-opts]
  (when (seq specs)
    (let [specs   (dedupe-specs specs)
          refused (if check-entities (refusals check-entities specs) {})]
      (specs-result specs (fn [{entity-type :type, :keys [id] :as spec}]
                            (if-let [message (get refused [entity-type id])]
                              (refused-entity entity-type id message)
                              (run-referenced-entity spec max-rows run-opts)))))))

(defn- inject-referenced-entities
  [rff result]
  (qp.streaming/transforming-query-response
   rff
   (fn [response] (assoc-in response [:data :referenced_entities] result))))

(defn- withheld-result
  "A failed entry per spec, `{type-string {id-string result}}`, running nothing. Failed rather than left out: a client
  takes a missing entry as unanswered and asks for it again."
  [specs]
  (when (seq specs)
    (specs-result (dedupe-specs specs) (constantly {:status "failed", :error_type "withheld"}))))

(defn- maybe-wrap-qp
  "Wrap a qp fn `(fn [query rff])` to inject `(result-fn specs run-opts)` under `data.referenced_entities`, with
  `run-opts` taken from the query (see [[run-referenced-entity]]). It's called when the qp is, not at wrap time; for a
  card endpoint that's inside the streaming body."
  [qp specs cache-strategy-fn result-fn]
  (if (seq specs)
    (fn [query rff]
      (let [run-opts {:parent-info            (:info query)
                      :cache-strategy-fn      cache-strategy-fn
                      :ignore-cached-results? (perf/get-in query [:middleware :ignore-cached-results?])}]
        (if-let [result (result-fn specs run-opts)]
          (qp query (inject-referenced-entities rff result))
          (qp query rff))))
    qp))

;;; ---------------------------------------------------------------------------------------------------------
;;; The dynamic-goals consumer: both entry points, plus reading goal sources out of a saved card's viz
;;; settings. The only goal-aware code here. Gets productionized in GDGT-2826.
;;; ---------------------------------------------------------------------------------------------------------

(def ^:private goal-max-rows
  "A goal is a single value, so its entity must produce one row."
  1)

(defn maybe-wrap-rff-for-goals
  "Run `specs` eagerly and decorate `rff` to inject their values under `data.referenced_entities`.
  `check-entities`, when given, refuses specs before they run (see [[referenced-entities-result]])."
  [rff specs check-entities]
  (if-let [result (referenced-entities-result specs goal-max-rows check-entities nil)]
    (inject-referenced-entities rff result)
    rff))

(defn- goal-sources
  "Runnable goal references a chart with `display` shows in `viz-settings`, with toggles read from
  `effective-settings`."
  [display viz-settings effective-settings]
  ;; public/embed runs skip the read check; [[metabase.queries.core/check-new-goal-references!]] gates a goal when a
  ;; user saves or places it (internal writes and copies are exempt)
  (into []
        (comp (keep dynamic-goals/goal-source)
              ;; a goal pointing at something we can't run is dropped rather than failing the request
              (filter (comp entity-types :type)))
        (dynamic-goals/shown-goal-values display viz-settings effective-settings)))

(defn- sources->specs
  "One spec per referenced entity, carrying every column any goal asked it for."
  [sources]
  (when (seq sources)
    (perf/mapv (fn [[[entity-type id] ss]]
                 {:type    entity-type
                  :id      id
                  :columns (vec (distinct (map :column ss)))})
               (group-by (juxt :type :id) sources))))

(defn viz-settings->goal-specs
  "Referenced-entity specs for the goals a chart with `display` shows in `viz-settings-maps`; nil when there are none.
  Toggles come from `effective-settings`, defaulting to the single map.

  Takes every settings map a renderer might read rather than their merge: renderers disagree about which half
  they consult (a gauge reads the card's, a line chart the dashcard's), so a goal on the losing half of the
  merge still has to run or resolving it at render time throws."
  ([display viz-settings]
   (viz-settings->goal-specs display [viz-settings] viz-settings))
  ([display viz-settings-maps effective-settings]
   (sources->specs (mapcat #(goal-sources display % effective-settings) viz-settings-maps))))

(defn maybe-wrap-qp-for-goals
  "Derive specs from the goals `card` draws on `dashcard` (nil for a card on its own) and wrap `qp` to inject their
  values. Exports skip this: only `:api` responses render goals. `cache-strategy-fn` picks a referenced card's
  cache strategy (see [[run-referenced-entity]]). With `withhold?`, each goal gets a failed `withheld` entry and
  nothing runs."
  [qp card dashcard export-format cache-strategy-fn & {:keys [withhold?]}]
  (if-let [{:keys [display viz-settings effective-settings]} (and (= export-format :api)
                                                                  (dynamic-goals/goal-scope card dashcard))]
    (maybe-wrap-qp qp
                   (viz-settings->goal-specs display viz-settings effective-settings)
                   cache-strategy-fn
                   (if withhold?
                     (fn [specs _run-opts] (withheld-result specs))
                     #(referenced-entities-result %1 goal-max-rows nil %2)))
    qp))
