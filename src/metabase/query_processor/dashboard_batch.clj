(ns metabase.query-processor.dashboard-batch
  "Batch query execution for all cards on a dashboard. Runs shared work (dashboard fetch, permission
   checks, parameter resolution) once and fans out individual card queries in parallel, streaming
   results back as NDJSON."
  (:require
   [clojure.core.async :as a]
   [clojure.set :as set]
   [com.climate.claypoole :as cp]
   [metabase.api.common :as api]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.walk.util :as lib.walk.util]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.streaming.batch-ndjson :as batch-ndjson]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.users.models.user-parameter-value :as user-parameter-value]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (java.io OutputStream)
   (java.util.concurrent BlockingQueue LinkedBlockingQueue)
   (org.eclipse.jetty.io EofException)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Thread Pool ------------------------------------------------

(def ^:dynamic *thread-pool*
  "Claypoole thread pool for batch card queries. Bind to `:serial` to run on the calling thread
   (useful for testing and query-count measurement). Default is a shared fixed pool."
  nil)

(defonce ^:private default-thread-pool
  (delay (cp/threadpool 8 :name "batch-card-query-pool")))

;;; -------------------------------------- EE Request-Scoped Cache Bindings --------------------------------------

(defenterprise impersonation-batch-cache-bindings
  "Returns a Var->atom bindings map for EE impersonation caching. OSS returns {}."
  metabase-enterprise.impersonation.driver
  []
  {})

(defenterprise routing-batch-cache-bindings
  "Returns a Var->atom bindings map for EE database routing caching. OSS returns {}."
  metabase-enterprise.database-routing.common
  []
  {})

(defenterprise cache-strategy-batch-cache-bindings
  "Returns a Var->atom bindings map for EE cache strategy caching. OSS returns {}."
  metabase-enterprise.cache.strategies
  []
  {})

(defenterprise warm-question-cache-configs!
  "Pre-warm cache strategy lookups for a batch of card IDs. OSS no-op."
  metabase-enterprise.cache.strategies
  [_card-ids]
  nil)

(defn- ee-batch-cache-bindings
  "Collect all EE request-scoped cache bindings for batch query execution."
  []
  (merge (impersonation-batch-cache-bindings)
         (routing-batch-cache-bindings)
         (cache-strategy-batch-cache-bindings)))

;;; -------------------------------------------- Writer Thread --------------------------------------------

(def ^:private queue-capacity
  "Capacity of the writer-thread inbox. Small enough that a slow client backpressures through the
  queue into the QP workers before heap grows unbounded; large enough that a healthy client never
  stalls on it."
  256)

(def ^:private ^:dynamic *done-sentinel* ::done)

(defn- start-writer-thread!
  "Launch a daemon thread that drains `queue`, writing `:bytes` to `os` and calling `.flush` only
  when `:flush?` is set. Exits when it dequeues [[*done-sentinel*]]. On `EofException` (client
  disconnect), drains the remaining queue to the floor so producers' `.put` calls don't block."
  ^Thread [^BlockingQueue queue ^OutputStream os]
  (doto (Thread.
         (fn []
           (try
             (loop []
               (let [msg (.take queue)]
                 (when-not (identical? *done-sentinel* msg)
                   (let [^bytes bs (:bytes msg)]
                     (.write os bs 0 (alength bs)))
                   (when (:flush? msg)
                     (.flush os))
                   (recur))))
             (catch EofException _
               ;; Client disconnected — drain the queue so producers can finish and shut down.
               (loop []
                 (when-not (identical? *done-sentinel* (.take queue))
                   (recur))))
             (catch Throwable t
               (log/error t "Batch NDJSON writer thread failed")
               (loop []
                 (when-not (identical? *done-sentinel* (.take queue))
                   (recur))))))
         "batch-ndjson-writer")
    (.setDaemon true)
    (.start)))

;;; -------------------------------------------- Shared Work Helpers --------------------------------------------

(defn- fetch-dashboard-with-resolved-params
  "Fetch the dashboard and hydrate its resolved params. Single DB hit for all cards."
  [dashboard-id]
  (-> (t2/select-one :model/Dashboard :id dashboard-id)
      (t2/hydrate :resolved-params)
      (api/check-404)))

(defn- build-dashboard-param-map
  "Build the param-id->param map from dashboard resolved params, stripping defaults per the convention
   established in [[metabase.query-processor.dashboard/resolve-params-for-query]]."
  [dashboard]
  (into {}
        (map (fn [[param-id param]]
               [param-id (dissoc param :default)]))
        (:resolved-params dashboard)))

(defn- batch-validate-card-membership
  "Validate that all requested {dashcard-id, card-id} pairs belong to this dashboard.
   Returns a set of valid [dashcard-id card-id] pairs. Single DB query instead of N."
  [dashboard-id cards]
  (let [dashcard-ids   (set (map :dashcard-id cards))
        ;; Fetch all dashcards for this dashboard that match requested IDs
        valid-dashcards (t2/select [:model/DashboardCard :id :card_id]
                                   :dashboard_id dashboard-id
                                   :id [:in dashcard-ids])
        ;; Build set of [dashcard-id card-id] pairs from primary assignment
        primary-pairs  (into #{} (map (fn [dc] [(:id dc) (:card_id dc)])) valid-dashcards)
        ;; For cards not matching primary, check series
        unmatched      (remove (fn [{:keys [dashcard-id card-id]}]
                                 (contains? primary-pairs [dashcard-id card-id]))
                               cards)
        series-pairs   (when (seq unmatched)
                         (let [series-rows (t2/select [:model/DashboardCardSeries :dashboardcard_id :card_id]
                                                      :dashboardcard_id [:in (set (map :dashcard-id unmatched))]
                                                      :card_id [:in (set (map :card-id unmatched))])]
                           (into #{} (map (fn [s] [(:dashboardcard_id s) (:card_id s)])) series-rows)))]
    (into primary-pairs series-pairs)))

(def ^:private card-columns-for-query
  "Columns needed by [[metabase.query-processor.card/process-query-for-card]]."
  [:id :name :dataset_query :database_id :collection_id :type :result_metadata
   :visualization_settings :display :cache_invalidated_at :entity_id :created_at
   :card_schema :parameters])

(defn- batch-fetch-cards
  "Fetch all card data needed for query processing in a single query. Returns {card-id card-instance}."
  [card-ids]
  (into {}
        (map (fn [card] [(:id card) card]))
        (t2/select (into [:model/Card] card-columns-for-query) :id [:in (set card-ids)])))

(defn- batch-fetch-dashcard-viz
  "Fetch visualization_settings for all dashcards in a single query. Returns {dashcard-id viz-settings}."
  [dashcard-ids]
  (into {}
        (map (fn [dc] [(:id dc) (:visualization_settings dc)]))
        (t2/select [:model/DashboardCard :id :visualization_settings] :id [:in (set dashcard-ids)])))

(defn- extract-source-card-ids
  "Extract all card IDs referenced by the queries in `cards`. Normalizes each query to pMBQL
  and uses [[lib.walk.util/all-source-card-ids]] for comprehensive extraction."
  [cards]
  (into #{}
        (comp (keep :dataset_query)
              (keep (fn [dq]
                      (try
                        (lib.walk.util/all-source-card-ids (lib/normalize ::lib.schema/query dq))
                        (catch Exception _
                          nil))))
              cat)
        cards))

(defn- resolve-all-transitive-card-ids
  "Given a map of card-id->card, resolve all transitively referenced card IDs by following
  source-card references to arbitrary depth. Returns the full set of all card IDs."
  [card-id->card]
  (loop [known-cards card-id->card
         all-ids    (set (keys card-id->card))]
    (let [source-ids (extract-source-card-ids (vals known-cards))
          new-ids    (set/difference source-ids all-ids)]
      (if (perf/empty? new-ids)
        all-ids
        (let [new-cards (batch-fetch-cards new-ids)]
          (recur (merge known-cards new-cards)
                 (into all-ids new-ids)))))))

;;; ---------------------------------------- Per-Card Query Execution ----------------------------------------

(defn- resolve-params-for-card
  "Resolve parameters for a single card using the pre-computed dashboard param map.
   This is the per-card portion of parameter resolution — the dashboard-level work is already done."
  [card-id dashcard-id dashboard-param-id->param request-params]
  (let [request-params          (some-> request-params seq (->> (lib/normalize ::dashboards.schema/parameters)))
        request-param-id->param (into {} (map (juxt :id #(dissoc % :default))) request-params)
        merged-parameters       (vals (merge (#'qp.dashboard/dashboard-param-defaults dashboard-param-id->param card-id)
                                             request-param-id->param))]
    (into [] (comp (map (partial #'qp.dashboard/resolve-param-for-card card-id dashcard-id dashboard-param-id->param))
                   (filter some?))
          merged-parameters)))

(defn- make-batch-make-run
  "Build a `:make-run` function closure for a single card's execution. The returned make-run binds
  `qp.pipeline/*result*` so that completed queries flush their `card-end` envelope and failed
  queries emit a `card-error`. Rows stream directly into `queue` via the [[batch-ndjson]] writer —
  workers never touch the output stream themselves."
  [^BlockingQueue queue dashcard-id card-id]
  (fn [qp _export-format]
    (fn [query info]
      (let [writer (batch-ndjson/batch-card-writer queue dashcard-id card-id)
            rff    (qp.streaming/streaming-rff writer)]
        (binding [qp.pipeline/*result*
                  (fn [result]
                    (cond
                      (= (:status result) :completed)
                      (try
                        (qp.si/finish! writer result)
                        (catch EofException _))

                      (= (:status result) :failed)
                      ;; Forward the full QP error map (`error`,
                      ;; `error_is_curated`, `error_type`, `ex-data`, ...) so
                      ;; the FE can render a curated message.
                      (batch-ndjson/emit-card-error!
                       queue dashcard-id card-id
                       (merge
                        {:status  (or (-> result :ex-data :status-code)
                                      (:status-code result)
                                      500)
                         :message (or (:error result)
                                      "Unknown error running card query")}
                        (dissoc result :class :stacktrace))))
                    (qp.pipeline/default-result-handler result))]
          (qp (update query :info merge info) rff))))))

(defn- run-single-card-query
  "Execute a single card query. Rows / completion / failure are streamed into `queue` via the
  rebound [[qp.pipeline/*result*]]. Returns a status keyword: `:success`, `:failed`, or `:error`
  (the latter for exceptions escaping the QP)."
  [^BlockingQueue queue
   {:keys [dashboard-id card-id dashcard-id dashboard-param-id->param parameters
           ignore-cache context prefetched-card prefetched-dash-viz]
    :or   {context :dashboard}}]
  (try
    (let [resolved-params (resolve-params-for-card card-id dashcard-id dashboard-param-id->param parameters)
          options         (cond-> {:dashboard-id dashboard-id
                                   :card-id      card-id
                                   :dashcard-id  dashcard-id
                                   :parameters   resolved-params
                                   :ignore-cache (boolean ignore-cache)
                                   :constraints  (qp.constraints/default-query-constraints)
                                   :context      context
                                   :make-run     (make-batch-make-run queue dashcard-id card-id)}
                            prefetched-card     (assoc :prefetched-card prefetched-card)
                            prefetched-dash-viz (assoc :prefetched-dash-viz prefetched-dash-viz))
          result          (binding [qp.card/*allow-arbitrary-mbql-parameters* true]
                            (qp.card/process-query-for-card card-id :api options))]
      (if (= (:status result) :failed)
        :failed
        :success))
    (catch EofException _
      ;; Client disconnected — nothing to report; writer thread will exit on its own.
      :error)
    (catch Throwable e
      ;; Emit a fully-shaped QP error map so the FE can render a curated
      ;; message / permission icon. `check-403`-style throws don't tag their
      ;; ex-data with a `:type`, so default 403s to `missing-required-permissions`.
      (let [data       (ex-data e)
            status     (or (:status-code data) 500)
            message    (ex-message e)
            error-type (or (:type data)
                           (when (= status 403) qp.error-type/missing-required-permissions))]
        (log/warnf e "Batch card query failed for dashcard %d card %d" dashcard-id card-id)
        (batch-ndjson/emit-card-error! queue dashcard-id card-id
                                       (cond-> {:status  status
                                                :message message
                                                :error   message}
                                         error-type (assoc :error_type error-type)))
        :error))))

;;; ------------------------------------------- Batch Orchestrator -------------------------------------------

(defn- get-all-dashcards
  "Get all non-virtual dashcards for a dashboard (those with a card_id)."
  [dashboard-id]
  (into []
        (comp (filter :card_id)
              (map (fn [dc] {:dashcard-id (:id dc) :card-id (:card_id dc)})))
        (t2/select [:model/DashboardCard :id :card_id] :dashboard_id dashboard-id)))

(defn process-batch-queries
  "Execute queries for multiple cards on a dashboard in a single request.

   Does all shared work (dashboard fetch, permission checks, parameter resolution setup) once,
   then fans out individual card queries in parallel. Returns a StreamingResponse that streams
   NDJSON results as each card completes.

   Options:
   - `:dashboard-id` — required
   - `:parameters`   — dashboard filter parameter values
   - `:ignore-cache` — whether to ignore cached results
   - `:cards`        — optional sequence of `{:dashcard-id N :card-id N}` maps; if omitted, runs all cards
   - `:context`      — query context (default `:dashboard`)"
  [{:keys [dashboard-id parameters ignore-cache cards context]
    :or   {context :dashboard}}]
  (span/with-span! {:name       "batch-dashboard-card-queries"
                    :attributes {:dashboard/id dashboard-id}}
    ;; === Shared work: done once ===
    (let [dashboard              (api/read-check (fetch-dashboard-with-resolved-params dashboard-id))
          dashboard-param-id->param (build-dashboard-param-map dashboard)
          ;; Determine which cards to run
          cards                  (or (seq cards) (get-all-dashcards dashboard-id))
          _                      (when (perf/empty? cards)
                                   (api/check-404 false))
          ;; Batch validate membership
          valid-pairs            (batch-validate-card-membership dashboard-id cards)
          ;; Batch fetch card data and dashcard viz settings for all cards at once
          card-id->card          (batch-fetch-cards (map :card-id cards))
          card-db-ids            (into {} (map (fn [[id card]] [id (:database_id card)])) card-id->card)
          dashcard-id->viz       (batch-fetch-dashcard-viz (map :dashcard-id cards))
          ;; Current user info for binding conveyance
          current-user-id        api/*current-user-id*
          current-user-perms     @api/*current-user-permissions-set*
          metadata-cache         lib-be/*metadata-provider-cache*
          ;; Pre-warm metadata providers so worker threads don't all race to fetch database metadata.
          _                      (doseq [db-id (distinct (vals card-db-ids))]
                                   (lib.metadata/database (lib-be/application-database-metadata-provider db-id)))
          ;; Request-scoped caches for cross-card deduplication of EE permission/routing/cache-strategy lookups.
          ee-bindings            (ee-batch-cache-bindings)
          ;; Pre-warm question-level cache configs in a single query so worker threads
          ;; don't each hit the DB individually. Includes transitive source-card references.
          all-card-ids           (resolve-all-transitive-card-ids card-id->card)
          _                      (with-bindings ee-bindings
                                   (warm-question-cache-configs! all-card-ids))]
      ;; Fire dashboard-queried event once
      (events/publish-event! :event/dashboard-queried {:object-id dashboard-id :user-id current-user-id})
      ;; Store user parameter values once
      (when (and current-user-id (seq parameters))
        (let [normalized-params (some-> parameters seq (->> (lib/normalize ::dashboards.schema/parameters)))]
          (user-parameter-value/store! current-user-id dashboard-id normalized-params)))
      ;; === Stream results ===
      (streaming-response/streaming-response {:content-type "application/x-ndjson"} [os canceled-chan]
        (let [pool          (or *thread-pool* @default-thread-pool)
              queue         (LinkedBlockingQueue. (int queue-capacity))
              writer-thread (start-writer-thread! queue os)
              succeeded     (volatile! 0)
              failed        (volatile! 0)
              ;; Pre-classify cards into immediately-resolvable errors vs queries to run
              {to-query true, immediate-errors false}
              (group-by
               (fn [{:keys [dashcard-id card-id]}]
                 (cond
                   (not (contains? valid-pairs [dashcard-id card-id]))
                   false ; not in dashboard

                   (and current-user-id
                        (= :blocked
                           (perms/most-permissive-database-permission-for-user
                            current-user-id :perms/view-data (get card-db-ids card-id))))
                   false ; blocked

                   :else true))
               cards)]
          (try
            ;; Emit a fully-shaped QP error map (`status`, `error`,
            ;; `error_type`, ...) — `getDashcardResultsError` needs
            ;; `error_type` to render the permission icon/message for 403s.
            (doseq [{:keys [dashcard-id card-id]} immediate-errors]
              (vswap! failed inc)
              (batch-ndjson/emit-card-error!
               queue dashcard-id card-id
               (if (contains? valid-pairs [dashcard-id card-id])
                 {:status     403
                  :message    "You don't have permission to view this card"
                  :error      "You don't have permission to view this card"
                  :error_type qp.error-type/missing-required-permissions}
                 {:status  404
                  :message "Card not found in dashboard"
                  :error   "Card not found in dashboard"})))
            ;; Run queries via claypoole — results flow to the queue as rows arrive.
            (doseq [result (cp/upmap pool
                                     (fn [{:keys [dashcard-id card-id]}]
                                       (if (a/poll! canceled-chan)
                                         :canceled
                                         (let [bindings (merge {#'api/*current-user-id*              current-user-id
                                                                #'api/*current-user-permissions-set* (atom current-user-perms)
                                                                #'lib-be/*metadata-provider-cache*   metadata-cache}
                                                               ee-bindings)]
                                           (with-bindings bindings
                                             (run-single-card-query
                                              queue
                                              {:dashboard-id              dashboard-id
                                               :card-id                   card-id
                                               :dashcard-id               dashcard-id
                                               :dashboard-param-id->param dashboard-param-id->param
                                               :parameters                parameters
                                               :ignore-cache              ignore-cache
                                               :context                   context
                                               :prefetched-card           (get card-id->card card-id)
                                               :prefetched-dash-viz       (get dashcard-id->viz dashcard-id)})))))
                                     (or to-query []))]
              (case result
                :success  (vswap! succeeded inc)
                :failed   (vswap! failed inc)
                :error    (vswap! failed inc)
                :canceled nil
                nil))
            ;; Completion sentinel + shutdown
            (let [s @succeeded f @failed]
              (batch-ndjson/emit-complete! queue {:total (+ s f) :succeeded s :failed f}))
            (finally
              (.put queue *done-sentinel*)
              (.join writer-thread))))))))
