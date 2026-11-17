(ns metabase.dynamic-goals.core
  "Values of dynamic goal sources: the cards and measures a chart's goals read (see
  [[metabase.visualization-settings.dynamic-goals]]).

  Each source runs on its own as a plain top-level query, one after another. A source that fails (no access, too many
  rows, an error, ...) fails on its own and never fails the others or the chart.

  Entry points, by who asks:

  * [[goal-values]]: a signed-in client naming its sources (`POST /api/dynamic-goal/values`).
  * [[chart-goal-values]]: in-process callers (notifications, dashboard PDF, ...) for a saved chart's goals.
  * [[chart-context-goal-values]]: public, embed and preview routes, with only their shared resolver's output.

  API routes wrap the result in [[goal-values-response]]."
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
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf]
   [metabase.visualization-settings.dynamic-goals :as viz.dynamic-goals])
  (:import
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(def max-sources
  "How many sources one call runs at most. A chart needs a handful; past this is a client bug or a fan-out attempt."
  20)

(def ^:private max-rows
  "A goal is a single value, so its source must produce one row."
  1)

(def ^:private model->query-key
  "Where each goal source model keeps its runnable query."
  {:model/Card    :dataset_query
   :model/Measure :definition})

(def ^:private source-models
  "`{:model :query-key}` per source type, for the types a dynamic goal can reference."
  (update-vals viz.dynamic-goals/goal-entity-models
               (fn [model] {:model model, :query-key (model->query-key model)})))

(def sources-schema
  "Schema for the sources a client asks [[goal-values]] for."
  [:sequential {:max max-sources}
   [:map {:closed true}
    [:type (into [:enum] (sort (keys source-models)))]
    [:id pos-int?]
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

(mr/def ::chart-context
  "What a public, embed or preview route's shared resolver found for a chart."
  [:map
   [:card                 :map]
   [:dashcard             {:optional true} [:maybe :map]]
   [:dashboard-id         {:optional true} [:maybe pos-int?]]
   [:signed-parameter-ids [:set :string]]])

;;; ------------------------------------------------ Running sources -------------------------------------------------

(defn- failed
  [error-type message]
  (cond-> {:status "failed"}
    message    (assoc :error message)
    error-type (assoc :error_type error-type)))

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
  "The query to run for `source`. A metric's breakouts group it for display and come off; filters and joins stay."
  [source query-key]
  (let [query (query-key source)]
    (if-not (= :metric (:type source))
      query
      (let [query (lib/query (lib-be/application-database-metadata-provider (:database query)) query)]
        (cond-> query
          (lib/mbql-stage? query -1) lib/remove-all-breakouts)))))

(defn- source-query
  "`query` set up to run for a goal: one row over the limit, and recorded under the `:dynamic-goal` context."
  [query source-type id {:keys [dashboard-id ignore-cache?]}]
  (-> query
      (assoc
       ;; one over, so a source returning too much is rejected instead of silently truncated
       :constraints {:max-results (inc max-rows), :max-results-bare-rows (inc max-rows)}
       ;; else a card source's id makes this run overwrite its result_metadata (GDGT-3454), and a metric's stripped
       ;; breakouts would erase its dimension columns
       :middleware {:skip-results-metadata? true
                    :ignore-cached-results? (boolean ignore-cache?)})
      (dissoc :info)
      (qp/userland-query (cond-> {:executed-by api/*current-user-id*
                                  :context     :dynamic-goal}
                           dashboard-id           (assoc :dashboard-id dashboard-id)
                           ;; :card-id lands in the QueryExecution row and the query remark: a measure can't borrow it
                           (= source-type "card") (assoc :card-id id)))))

(defn- run-query
  "Run `query` top-level. Its own cancel chan, fed from the caller's: a finished query closes its chan, and later
  sources still need one. A card runs as a saved question (`card-id`), so reading it is enough; a measure has no such
  check and needs query perms on its table."
  [query card-id]
  (qp.pipeline/do-with-own-canceled-chan
   (fn []
     (binding [qp.perms/*card-id* card-id]
       (qp/process-query query)))))

(defn- run-source
  "Run one source and return its result. Never throws."
  [{source-type :type, :keys [id columns]} {:keys [dashboard-id] :as opts}]
  (let [{:keys [model query-key]} (source-models source-type)
        card?                     (= source-type "card")]
    (try
      ;; passes for anything under an anonymous route's `as-admin`: there saving the goal is the gate
      (let [source (api/read-check model id)]
        ;; it runs with no parameter values, so each would get its default or none at all
        (if (queries/card-reads-parameters? source)
          (do
            (log/warnf "Goal source %s %s reads parameters, so it can't run on its own" source-type id)
            (failed "has-parameters"
                    (tru "Goal source {0} {1} uses variables, so it can''t run on its own." source-type id)))
          (let [query          (source-query (runnable-query source query-key) source-type id opts)
                ;; measures have no cache config. Computed on the final query: its hash keys the average run time
                cache-strategy (when card?
                                 (qp.card/card-cache-strategy source dashboard-id query))
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

(defn- group-by-source
  "`[[type id] items]` pairs of `items` grouped by source, in the order each source first appears, so the
  [[max-sources]] cut is stable."
  [items]
  (let [groups (group-by (juxt :type :id) items)]
    (into [] (comp (map (juxt :type :id)) (distinct) (map (juxt identity groups))) items)))

(defn- dedupe-sources
  "One source per entity, with every column any duplicate asked for. One with no `:columns` wants them all, so it wins."
  [sources]
  (perf/mapv (fn [[[source-type id] same]]
               {:type    source-type
                :id      id
                :columns (when (perf/every? (comp seq :columns) same)
                           (vec (distinct (mapcat :columns same))))})
             (group-by-source sources)))

(defn- results-map
  "`{type-string {id-string result}}` for `sources` and their `results`, minus nil results. String keys, so it encodes
  as `{\"card\": {\"1\": {...}}}`."
  [sources results]
  (reduce (fn [acc [{source-type :type, :keys [id]} result]]
            (cond-> acc
              result (assoc-in [source-type (str id)] result)))
          {}
          (map vector sources results)))

(defn- over-the-limit
  [{source-type :type, :keys [id]}]
  (log/warnf "Goal source %s %s is past the limit of %s sources" source-type id max-sources)
  (failed "too-many-sources" (tru "A chart can read at most {0} goal sources." max-sources)))

(defn- refusals
  "`(check-sources sources)`, or a refusal of every source when the check throws: an unchecked source must not run."
  [check-sources sources]
  (if-not check-sources
    {}
    (try
      (check-sources sources)
      (catch Throwable e
        (log/error e "Failed to check goal sources; refusing them all")
        (let [message (tru "Could not check whether this goal source may be used.")]
          (into {} (map (fn [{source-type :type, :keys [id]}] [[source-type id] message])) sources))))))

(defn- run-sources
  "Results of `sources` as `{type-string {id-string result}}`, one source at a time. Past [[max-sources]] a source fails
  with `too-many-sources`; once the caller is canceled the rest get no entry."
  [sources {:keys [check-sources] :as opts}]
  (let [sources         (dedupe-sources sources)
        [allowed extra] (split-at max-sources sources)
        refused         (refusals check-sources allowed)
        results         (perf/mapv (fn [{source-type :type, :keys [id] :as source}]
                                     (when-not (qp.pipeline/canceled?)
                                       (if-let [message (get refused [source-type id])]
                                         (do (log/warnf "Refused goal source %s %s: %s" source-type id message)
                                             (failed nil message))
                                         (run-source source opts))))
                                   allowed)]
    (merge-with merge
                (results-map allowed results)
                (results-map extra (map over-the-limit extra)))))

(defn goal-values
  "Signed-in path. Runs `sources` as the current user, read-checking each one.

  `:check-sources` returns `{[type id] message}` for the deduped sources that may not run (data-app refusals),
  `:dashboard-id` picks card cache strategies and is recorded with each run, `:ignore-cache?` skips cached results."
  [sources & {:keys [dashboard-id ignore-cache? check-sources]}]
  (run-sources sources {:dashboard-id  dashboard-id
                        :ignore-cache? ignore-cache?
                        :check-sources check-sources}))

;;; ------------------------------------------------- Chart sources --------------------------------------------------

(defn- sources-in
  "Runnable goal sources a chart with `display` shows in `viz-settings`, with toggles read from `effective-settings`."
  [display viz-settings effective-settings]
  (into []
        (comp (keep viz.dynamic-goals/goal-source)
              ;; a goal pointing at something we can't run is dropped rather than failing the chart
              (filter (comp source-models :type)))
        (viz.dynamic-goals/shown-goal-values display viz-settings effective-settings)))

(defn chart-goal-sources
  "Sources of the goals saved `card` draws on `dashcard` (nil for a lone card): `[{:type :id :columns}]`, one per entity.
  Empty for a series card. Reads every settings map a renderer might read, not their merge: renderers disagree on which
  half they consult."
  [card dashcard]
  (if-let [{:keys [display viz-settings effective-settings]} (viz.dynamic-goals/goal-scope card dashcard)]
    (perf/mapv (fn [[[source-type id] same]]
                 {:type    source-type
                  :id      id
                  :columns (vec (distinct (map :column same)))})
               (group-by-source (mapcat #(sources-in display % effective-settings) viz-settings)))
    []))

(defn- scrub-errors
  "Replace every error text with the generic one anonymous viewers get: a raw driver message can name tables."
  [goal-values]
  (update-vals goal-values
               (fn [by-id]
                 (update-vals by-id (fn [result]
                                      (cond-> result
                                        (:error result) (assoc :error (tru "An error occurred while running the query."))))))))

(defn chart-goal-values
  "In-process callers (notifications, dashboard PDF, slackbot, static viz): goals `card` draws on `dashcard`, run under
  the caller's current bindings. `:anonymous?` replaces error texts with a generic one."
  [card dashcard & {:keys [dashboard-id ignore-cache? anonymous?]}]
  (cond-> (run-sources (chart-goal-sources card dashcard) {:dashboard-id  dashboard-id
                                                          :ignore-cache? ignore-cache?})
    anonymous? scrub-errors))

(defn assoc-chart-goal-values
  "`result` (a completed QP result for `card` on `dashcard`) with its [[chart-goal-values]] under
  `[:data :referenced_entities]`, where static rendering reads them. Never throws; a chart with no goals runs nothing."
  [result card dashcard & {:as opts}]
  (if (and (= :completed (:status result))
           (seq (chart-goal-sources card dashcard)))
    (try
      (if-let [values (not-empty (chart-goal-values card dashcard opts))]
        (assoc-in result [:data :referenced_entities] values)
        result)
      (catch Throwable e
        (log/warnf e "Error getting goal values for Card %s" (:id card))
        result))
    result))

(mu/defn chart-context-goal-values :- ::goal-values
  "Anonymous (public/embed/preview) path; takes only a shared resolver's output. Withholds every goal when the token
  signs a parameter value, else runs [[chart-goal-values]] as admin with generic error texts."
  [{:keys [card dashcard dashboard-id signed-parameter-ids]} :- ::chart-context]
  ;; a goal runs without parameter values, and a signed value often separates tenants. Any signed value withholds the
  ;; goals, wired to this card or not: an unwired source can still read tenant data
  (if (seq signed-parameter-ids)
    (let [sources (chart-goal-sources card dashcard)]
      (results-map sources (repeat (failed "withheld" nil))))
    ;; like the chart's own query: full perms, no new current user. Saving a goal checked its author can read it
    (request/as-admin
      (chart-goal-values card dashcard :dashboard-id dashboard-id :anonymous? true))))

;;; ---------------------------------------------------- Response ----------------------------------------------------

(defn goal-values-response
  "202 StreamingResponse with the JSON result of `(compute)`. Runs on the streaming pool under the caller's bindings; a
  client that hangs up cancels the sources still to run."
  [compute]
  (streaming-response/streaming-response {:content-type "application/json; charset=utf-8"} [os canceled-chan]
    (let [result (binding [qp.pipeline/*canceled-chan* canceled-chan]
                   (compute))]
      (when-not (a/poll! canceled-chan)
        (with-open [writer (BufferedWriter. (OutputStreamWriter. ^OutputStream os StandardCharsets/UTF_8))]
          (json/encode-to result writer {}))))))
