(ns metabase.query-processor.referenced-entities
  "Runs the queries a card references and injects their values into the response under `data.referenced_entities`,
  keyed by entity type and then by id.

  An entity that returns more rows than its caller asked for fails that entity, never the main query.

  Permissions are inherited from the endpoint's bindings rather than checked here: a signed-in caller gets a real
  read-check and soft-fails without it, alerts resolve as their creator, and public/embed run under their existing
  root-perms binding. So publishing a card deliberately exposes whatever its goals read, even an entity that is not
  itself shared (GDGT-2824).

  Each referenced query runs under its own QP store ([[qp.store/with-fresh-store]]): a store holds one database, so
  a nested run against a different one would otherwise be rejected.

  The runner knows nothing about what the specs are for. One row is the dynamic-goal consumer's requirement, not the
  runner's, so it's declared in the second section below along with the rest of the goal-aware code."
  (:require
   [clojure.core.async :as a]
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

(def specs-schema
  "Schema for the `referenced_entities` request param."
  [:maybe [:sequential
           [:map
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
  [query entity-type id max-rows]
  (assoc query
         ;; one over the limit, so an entity returning too much can be rejected instead of silently truncated. a
         ;; query with its own `:limit` under this still comes back short, which is how you ask for "the first N".
         :constraints {:max-results (inc max-rows), :max-results-bare-rows (inc max-rows)}
         ;; no :executed-by; it'd require a :query-hash for the query remark
         :info (cond-> {:context :question}
                 ;; :card-id ends up in the warehouse query remark, so a measure must not borrow the key
                 (= entity-type "card") (assoc :card-id id))))

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

(defn- child-canceled-chan
  "Cancel chan for a nested run: cancellation flows down from `parent`, but the nested run finishing can't close
  `parent` (see [[qp.pipeline/*reduce*]]) and leave the main query uncancelable."
  [parent]
  (let [child (a/promise-chan)]
    (when parent
      (a/go (when-some [v (a/<! parent)]
              (a/>! child v))))
    child))

(defn- run-referenced-entity
  "Never throws: any failure becomes `{:status \"failed\" :error ...}`."
  [{entity-type :type, :keys [id columns max_rows]} default-max-rows canceled-chan]
  (let [max-rows (or max_rows default-max-rows)
        {:keys [model query-key]} (entity-types entity-type)]
    (try
      (let [entity (api/read-check model id)
            ;; a nested run inside the outer streaming response must return an in-memory map,
            ;; not write to the outer stream
            result (qp.store/with-fresh-store
                     (binding [qp.pipeline/*result*        qp.pipeline/default-result-handler
                               qp.pipeline/*canceled-chan* canceled-chan
                               ;; a referenced card is a saved question, so reading it is enough. unbound, the
                               ;; perms check takes the ad-hoc branch and demands create-queries on its tables.
                               ;; measures have no equivalent yet, so they stay on the ad-hoc branch.
                               qp.perms/*card-id*          (when (= entity-type "card") id)]
                       (qp/process-query (referenced-query (runnable-query entity query-key) entity-type id max-rows))))
            data   (:data result)]
        (if (> (count (:rows data)) max-rows)
          (do
            (log/warnf "Referenced %s %s returned more than the requested %s row(s)" entity-type id max-rows)
            {:status "failed"
             :error  (tru "Referenced {0} {1} returned more rows than the requested maximum of {2}."
                          entity-type id max-rows)})
          {:status "completed"
           :data   (-> data
                       (perf/select-keys [:cols :rows])
                       (project-columns columns))}))
      (catch Throwable e
        (log/warnf e "Failed to run referenced %s %s" entity-type id)
        {:status "failed"
         :error  (or (ex-message e) (tru "Failed to run referenced query"))}))))

(defn- referenced-entities-result
  "Run each spec and return `{type-string {id-string result}}`, nil when there are none."
  [specs max-rows]
  (when (seq specs)
    ;; one child chan for the whole batch. the runs are sequential, so a chan each would only park a go block
    ;; per goal for the life of the request.
    (let [canceled-chan (child-canceled-chan qp.pipeline/*canceled-chan*)]
      (perf/not-empty
       (reduce (fn [acc {entity-type :type, :keys [id] :as spec}]
                 ;; string keys so the map serializes to JSON as `{"card": {"1": {...}}}`
                 (assoc-in acc [entity-type (str id)] (run-referenced-entity spec max-rows canceled-chan)))
               {}
               ;; don't start the next one if the client already hung up
               (take-while (fn [_] (not (qp.pipeline/canceled?))) specs))))))

(defn- inject-referenced-entities
  [rff result]
  (qp.streaming/transforming-query-response
   rff
   (fn [response] (assoc-in response [:data :referenced_entities] result))))

(defn- maybe-wrap-qp
  "Wrap a qp fn `(fn [query rff])` to inject the results of `specs` under `data.referenced_entities`. The specs run
  when the qp is invoked, which for a card endpoint is inside the streaming body rather than on the request thread."
  [qp specs max-rows]
  (if (seq specs)
    (fn [query rff]
      (if-let [result (referenced-entities-result specs max-rows)]
        (qp query (inject-referenced-entities rff result))
        (qp query rff)))
    qp))

;;; ---------------------------------------------------------------------------------------------------------
;;; The dynamic-goals consumer: both entry points, plus reading goal sources out of a saved card's viz
;;; settings. The only goal-aware code here. Gets productionized in GDGT-2826.
;;; ---------------------------------------------------------------------------------------------------------

(def ^:private goal-max-rows
  "A goal is a single value, so its entity must produce one row."
  1)

(defn maybe-wrap-rff-for-goals
  "Run `specs` eagerly and decorate `rff` to inject their values under `data.referenced_entities`."
  [rff specs]
  (if-let [result (referenced-entities-result specs goal-max-rows)]
    (inject-referenced-entities rff result)
    rff))

(defn viz-settings->goal-specs
  "Extract referenced-entity specs from merged viz settings; nil when there are none."
  [viz]
  (when-let [sources (perf/not-empty
                      (into []
                            (comp (keep dynamic-goals/goal-source)
                                  ;; a goal pointing at something we can't run is dropped rather than failing the request
                                  (filter (comp entity-types :type)))
                            (dynamic-goals/goal-values viz)))]
    (perf/mapv (fn [[[entity-type id] ss]]
                 {:type    entity-type
                  :id      id
                  :columns (vec (distinct (map :column ss)))})
               (group-by (juxt :type :id) sources))))

(defn maybe-wrap-qp-for-goals
  "Derive specs from a card's merged `viz` settings and wrap `qp` to inject their values. Only `:api` responses
  render goals; a CSV or XLSX export would run the referenced queries and throw the values away."
  [qp viz export-format]
  (if (= export-format :api)
    (maybe-wrap-qp qp (viz-settings->goal-specs viz) goal-max-rows)
    qp))
