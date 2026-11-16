(ns metabase.dynamic-goals.core
  "Values of dynamic goal sources: the cards and measures a chart's goals read (see
  [[metabase.visualization-settings.dynamic-goals]]).

  Each source runs as an ordinary top-level query through the plain query processor, apart from the chart's own query,
  which this namespace never touches. A source that fails (no access, too many rows, an error, ...) fails on its own and
  never fails the others.

  Callers say where the sources come from and who they run as: the API endpoints wrap [[goal-values]] or
  [[chart-goal-values]] in [[goal-values-response]], and static viz and alerts call [[chart-goal-values]] directly."
  (:require
   [clojure.core.async :as a]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.queries.core :as queries]
   [metabase.query-processor :as qp]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf]
   [metabase.visualization-settings.dynamic-goals :as dynamic-goals])
  (:import
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)
   (java.util.concurrent Semaphore)))

(set! *warn-on-reflection* true)

(def max-sources
  "How many sources one call runs at most. A chart needs a handful; anything past this is a client bug or an attempt to
  fan one request out into many warehouse queries."
  20)

(def ^:private max-parallel-runs
  "How many sources of one call run at the same time, so a single chart can't take a whole connection pool."
  4)

(def ^:private source-models
  "Model and the key its runnable query lives under, per source type."
  {"card"    {:model :model/Card,    :query-key :dataset_query}
   "measure" {:model :model/Measure, :query-key :definition}})

(def ^:private max-rows
  "A goal is a single value, so its source must produce one row."
  1)

(def sources-schema
  "Schema for the sources a client asks [[goal-values]] for."
  [:sequential {:max max-sources}
   [:map {:closed true}
    [:type (into [:enum] (keys source-models))]
    [:id :int]
    [:columns {:optional true} [:maybe [:sequential :string]]]]])

(mr/def ::source-result
  "The result of running one goal source."
  [:map
   [:status     [:enum "completed" "failed"]]
   [:error      {:optional true} [:maybe :string]]
   [:error_type {:optional true} [:maybe [:enum "too-many-rows" "not-found" "has-parameters" "withheld"
                                          "too-many-sources"]]]
   [:data       {:optional true} [:maybe [:map
                                          [:cols [:sequential :map]]
                                          [:rows [:sequential [:sequential :any]]]]]]])

(mr/def ::goal-values
  "Goal source results by source type, then by source id. A source with no entry wasn't run."
  [:map-of :string [:map-of :string ::source-result]])

;;; ------------------------------------------------ Running sources -------------------------------------------------

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

(defn- runnable-query
  "The query to run for `source`. A metric's breakouts group it for display; a goal wants its value, so they come off.
  Filters and joins stay, they define what the metric measures."
  [source query-key]
  (let [query (query-key source)]
    (if-not (= :metric (:type source))
      query
      (let [query (lib/query (lib-be/application-database-metadata-provider (:database query)) query)]
        (cond-> query
          (lib/mbql-stage? query -1) lib/remove-all-breakouts)))))

(defn- source-query
  "`query` set up to run for a goal: limited to one row more than a goal takes, and recorded as a QueryExecution under
  the `:dynamic-goal` context."
  [query source-type id {:keys [dashboard-id ignore-cache?]}]
  (-> query
      (assoc
       ;; one over the limit, so a source returning too much can be rejected instead of silently truncated
       :constraints {:max-results (inc max-rows), :max-results-bare-rows (inc max-rows)}
       ;; otherwise a card source's id makes this run overwrite that card's result_metadata, and a metric's stripped
       ;; breakouts would erase its dimension columns
       :middleware {:skip-results-metadata? true
                    ;; a refresh of the chart refreshes its goals too
                    :ignore-cached-results? (boolean ignore-cache?)})
      (dissoc :info)
      (qp/userland-query (cond-> {:executed-by api/*current-user-id*
                                  :context     :dynamic-goal}
                           dashboard-id           (assoc :dashboard-id dashboard-id)
                           ;; :card-id ends up in the QueryExecution row and the warehouse query remark, so a measure
                           ;; must not borrow the key
                           (= source-type "card") (assoc :card-id id)))))

(defn- run-query
  "Run `query` with its own cancel chan, fed from the caller's: a finished query closes its chan, and the other sources
  of the same call still need theirs. A `card-id` gets that card's saved-question permission check: reading a saved
  question is enough to run it, while a measure has no such check and needs query access to its table."
  [query card-id]
  (qp.pipeline/do-with-own-canceled-chan
   (fn []
     (binding [qp.perms/*card-id* card-id]
       (qp/process-query query)))))

(defn- failed
  [error-type message]
  (cond-> {:status "failed"}
    message    (assoc :error message)
    error-type (assoc :error_type error-type)))

(defn- run-source
  "Run one source and return its result. Never throws: any failure becomes `{:status \"failed\" :error ...}`."
  [{source-type :type, :keys [id columns]} opts]
  (let [{:keys [model query-key]} (source-models source-type)
        card?                     (= source-type "card")]
    (try
      (let [source (api/read-check model id)]
        ;; a source runs with no parameter values, so it'd get each one's default or none at all. A measure has
        ;; neither parameters nor a `:dataset_query`
        (if (queries/reads-parameters? source)
          (do
            (log/warnf "Goal source %s %s reads parameters, so it can't run on its own" source-type id)
            (failed "has-parameters"
                    (tru "Goal source {0} {1} uses variables, so it can''t run on its own." source-type id)))
          (let [query          (source-query (runnable-query source query-key) source-type id opts)
                ;; measures have no cache config of their own. Computed on the final query, since its hash (which the
                ;; strategy's average execution time is looked up by) covers the constraints
                cache-strategy (when card?
                                 (qp.card/card-cache-strategy source (:dashboard-id opts) query))
                result         (run-query (cond-> query cache-strategy (assoc :cache-strategy cache-strategy))
                                          (when card? id))
                data           (:data result)]
            (cond
              ;; a userland run returns its failure instead of throwing it
              (not= :completed (:status result))
              (failed nil (or (:error result) (tru "Failed to run goal source query")))

              (> (count (:rows data)) max-rows)
              (do
                (log/warnf "Goal source %s %s returned more than %s row(s)" source-type id max-rows)
                (failed "too-many-rows"
                        (tru "Goal source {0} {1} returned more rows than the maximum of {2}."
                             source-type id max-rows)))

              :else
              {:status "completed"
               :data   (-> data
                           (perf/select-keys [:cols :rows])
                           (project-columns columns))}))))
      (catch Throwable e
        (log/warnf e "Failed to run goal source %s %s" source-type id)
        (failed (when (= 404 (:status-code (ex-data e))) "not-found")
                (or (ex-message e) (tru "Failed to run goal source query")))))))

(defn- dedupe-sources
  "One source per entity, carrying every column any duplicate asked for. A source with no `:columns` wants them all,
  so it wins over one that narrows."
  [sources]
  (perf/mapv (fn [[[source-type id] same]]
               {:type    source-type
                :id      id
                :columns (when (perf/every? (comp seq :columns) same)
                           (vec (distinct (mapcat :columns same))))})
             (group-by (juxt :type :id) sources)))

(defn- run-in-parallel
  "`(f x)` for each of `xs`, at most [[max-parallel-runs]] at a time, in order. A run starts only if the caller hasn't
  been canceled yet; a skipped one gets nil."
  [f xs]
  (let [semaphore (Semaphore. max-parallel-runs)
        runs      (perf/mapv (fn [x]
                               ;; `future` conveys the caller's bindings: who runs it, and its cancel chan
                               (future
                                 (.acquire semaphore)
                                 (try
                                   (when-not (qp.pipeline/canceled?)
                                     (f x))
                                   (finally
                                     (.release semaphore)))))
                             xs)]
    (perf/mapv deref runs)))

(defn- results-map
  "`{type-string {id-string result}}` for `sources` and their `results`, leaving out sources with no result. String keys,
  so the map serializes to JSON as `{\"card\": {\"1\": {...}}}`."
  [sources results]
  (reduce (fn [acc [{source-type :type, :keys [id]} result]]
            (cond-> acc
              result (assoc-in [source-type (str id)] result)))
          {}
          (map vector sources results)))

(defn- over-the-limit
  [{source-type :type, :keys [id]}]
  (log/warnf "Goal source %s %s is over the limit of %s sources per chart" source-type id max-sources)
  (failed "too-many-sources" (tru "A chart can read at most {0} goal sources." max-sources)))

(defn- refusals
  "`(check-sources sources)`, or a refusal for every source when the check throws: an unchecked source must not run,
  and a failed check must not fail the others."
  [check-sources sources]
  (if-not check-sources
    {}
    (try
      (check-sources sources)
      (catch Throwable e
        (log/error e "Failed to check goal sources; refusing them all")
        (let [message (tru "Could not check whether this goal source may be used.")]
          (into {} (map (fn [{source-type :type, :keys [id]}] [[source-type id] message])) sources))))))

(defn goal-values
  "Run each of `sources` (`{:type, :id, :columns}` maps), at most [[max-sources]] of them, and return
  `{type-string {id-string result}}`, where a result is `{:status \"completed\" :data {:cols :rows}}` or
  `{:status \"failed\" :error ... :error_type ...}`. Runs as the current user, with a read check on each source.

  Options:

  * `:check-sources` -- returns `{[type id] message}` for the deduped sources that may not run; those fail with that
    message instead of running.
  * `:dashboard-id` -- the dashboard the chart is on: recorded with each run, and picks a card source's cache strategy.
  * `:ignore-cache?` -- whether to skip cached results."
  [sources & {:keys [check-sources] :as opts}]
  (let [sources        (dedupe-sources sources)
        [allowed extra] (split-at max-sources sources)
        refused        (refusals check-sources allowed)
        results        (run-in-parallel (fn [{source-type :type, :keys [id] :as source}]
                                          (if-let [message (get refused [source-type id])]
                                            (do (log/warnf "Refused goal source %s %s: %s" source-type id message)
                                                (failed nil message))
                                            (run-source source opts)))
                                        allowed)]
    (merge-with merge
                (results-map allowed results)
                (results-map extra (map over-the-limit extra)))))

;;; ------------------------------------------------- Chart sources --------------------------------------------------

(defn- sources-in
  "Runnable goal sources a chart with `display` shows in `viz-settings`, with toggles read from `effective-settings`."
  [display viz-settings effective-settings]
  (into []
        (comp (keep dynamic-goals/goal-source)
              ;; a goal pointing at something we can't run is dropped rather than failing the chart
              (filter (comp source-models :type)))
        (dynamic-goals/shown-goal-values display viz-settings effective-settings)))

(defn chart-goal-sources
  "The sources of the goals `card` draws on `dashcard` (nil for a card on its own), one per entity with every column a
  goal asks it for. Empty when the chart draws no goals with a source.

  Reads every settings map a renderer might read rather than their merge: renderers disagree about which half they
  consult (a gauge reads the card's, a line chart the dashcard's), so a goal on the losing half of the merge still has
  to run."
  [card dashcard]
  (if-let [{:keys [display viz-settings effective-settings]} (dynamic-goals/goal-scope card dashcard)]
    (perf/mapv (fn [[[source-type id] same]]
                 {:type    source-type
                  :id      id
                  :columns (vec (distinct (map :column same)))})
               (group-by (juxt :type :id) (mapcat #(sources-in display % effective-settings) viz-settings)))
    []))

(defn chart-goal-values
  "[[goal-values]] for the goals `card` draws on `dashcard` (nil for a card on its own). Takes the same options."
  [card dashcard & {:as opts}]
  (goal-values (chart-goal-sources card dashcard) opts))

(defn withheld-chart-goal-values
  "A `withheld` failure for each goal source `card` draws on `dashcard`, running nothing. Failed rather than left out,
  so a client knows each goal is answered."
  [card dashcard]
  (results-map (chart-goal-sources card dashcard) (repeat (failed "withheld" nil))))

;;; ---------------------------------------------------- Response ----------------------------------------------------

(defn goal-values-response
  "A streaming JSON response with the result of `(compute)`. It runs off the request thread, under the bindings of the
  caller (who it runs as), and a client that hangs up cancels the sources still running."
  [compute]
  (streaming-response/streaming-response {:content-type "application/json; charset=utf-8"} [os canceled-chan]
    (let [result (binding [qp.pipeline/*canceled-chan* canceled-chan]
                   (compute))]
      (when-not (a/poll! canceled-chan)
        (with-open [writer (BufferedWriter. (OutputStreamWriter. ^OutputStream os StandardCharsets/UTF_8))]
          (json/encode-to result writer {}))))))
