(ns metabase.query-processor.dashboard-batch
  "Batch query execution for all cards on a dashboard. Runs shared work (dashboard fetch, permission
   checks, parameter resolution) once and fans out individual card queries in parallel, streaming
   results back as NDJSON."
  (:require
   [clojure.core.async :as a]
   [com.climate.claypoole :as cp]
   [metabase.api.common :as api]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.events.core :as events]
   [metabase.lib-be.metadata.jvm :as lib-be.jvm]
   [metabase.lib.core :as lib]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.dashboard :as qp.dashboard]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.users.models.user-parameter-value :as user-parameter-value]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (java.io OutputStream)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Thread Pool ------------------------------------------------

(def ^:dynamic *thread-pool*
  "Claypoole thread pool for batch card queries. Bind to `:serial` to run on the calling thread
   (useful for testing and query-count measurement). Default is a shared fixed pool."
  nil)

(defonce ^:private default-thread-pool
  (delay (cp/threadpool 8 :name "batch-card-query-pool")))

;;; ------------------------------------------------ NDJSON Writing ------------------------------------------------

(defn- write-ndjson-line!
  "Write a single NDJSON line (map encoded as JSON + newline) to the output stream and flush."
  [^OutputStream os m]
  (let [^bytes json-bytes (.getBytes ^String (json/encode m) StandardCharsets/UTF_8)
        ^bytes newline    (.getBytes "\n" StandardCharsets/UTF_8)]
    (.write os json-bytes)
    (.write os newline)
    (.flush os)))

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

(defn- batch-fetch-card-database-ids
  "Fetch database_id for all requested cards in a single query. Returns {card-id database-id}."
  [card-ids]
  (into {}
        (map (fn [row] [(:id row) (:database_id row)]))
        (t2/select [:model/Card :id :database_id :card_schema] :id [:in (set card-ids)])))

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

(defn- batch-make-run
  "A `:make-run` function for [[qp.card/process-query-for-card]] that executes the query synchronously
   and returns the raw result map, rather than wrapping in a StreamingResponse."
  [qp _export-format]
  (fn [query info]
    (qp (update query :info merge info) nil)))

(defn- run-single-card-query
  "Execute a single card query synchronously. Returns either a result map or an error map."
  [{:keys [dashboard-id card-id dashcard-id dashboard-param-id->param parameters
           ignore-cache context]
    :or   {context :dashboard}}]
  (try
    (let [resolved-params (resolve-params-for-card card-id dashcard-id dashboard-param-id->param parameters)
          options         {:dashboard-id dashboard-id
                           :card-id      card-id
                           :dashcard-id  dashcard-id
                           :parameters   resolved-params
                           :ignore-cache (boolean ignore-cache)
                           :constraints  (qp.constraints/default-query-constraints)
                           :context      context
                           :make-run     batch-make-run}]
      (binding [qp.card/*allow-arbitrary-mbql-parameters* true]
        (qp.card/process-query-for-card card-id :api options)))
    (catch Throwable e
      (let [data    (ex-data e)
            status  (or (:status-code data) 500)]
        (log/warnf e "Batch card query failed for dashcard %d card %d" dashcard-id card-id)
        {:error {:status  status
                 :message (ex-message e)}}))))

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
    (let [dashboard              (fetch-dashboard-with-resolved-params dashboard-id)
          _                      (api/read-check :model/Dashboard dashboard-id)
          dashboard-param-id->param (build-dashboard-param-map dashboard)
          ;; Determine which cards to run
          cards                  (or (seq cards) (get-all-dashcards dashboard-id))
          _                      (when (empty? cards)
                                   (api/check-404 false))
          ;; Batch validate membership
          valid-pairs            (batch-validate-card-membership dashboard-id cards)
          ;; Batch fetch database IDs for permission checks
          card-db-ids            (batch-fetch-card-database-ids (map :card-id cards))
          ;; Current user info for binding conveyance
          current-user-id        api/*current-user-id*
          current-user-perms     @api/*current-user-permissions-set*
          metadata-cache         lib-be.jvm/*metadata-provider-cache*]
      ;; Fire dashboard-queried event once
      (events/publish-event! :event/dashboard-queried {:object-id dashboard-id :user-id current-user-id})
      ;; Store user parameter values once
      (when (and current-user-id (seq parameters))
        (let [normalized-params (some-> parameters seq (->> (lib/normalize ::dashboards.schema/parameters)))]
          (user-parameter-value/store! current-user-id dashboard-id normalized-params)))
      ;; === Stream results ===
      (streaming-response/streaming-response {:content-type "application/x-ndjson"} [os canceled-chan]
        (let [pool      (or *thread-pool* @default-thread-pool)
              succeeded (volatile! 0)
              failed    (volatile! 0)
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
          ;; Write immediate errors
          (doseq [{:keys [dashcard-id card-id]} immediate-errors]
            (vswap! failed inc)
            (let [error (if (contains? valid-pairs [dashcard-id card-id])
                          {:status 403 :message "You don't have permission to view this card"}
                          {:status 404 :message "Card not found in dashboard"})]
              (write-ndjson-line! os {:type        "card-error"
                                      :dashcard_id dashcard-id
                                      :card_id     card-id
                                      :error       error})))
          ;; Run queries via claypoole — results stream in completion order
          (doseq [result (cp/upmap pool
                                   (fn [{:keys [dashcard-id card-id]}]
                                     (binding [api/*current-user-id*                current-user-id
                                               api/*current-user-permissions-set*   (atom current-user-perms)
                                               lib-be.jvm/*metadata-provider-cache* metadata-cache]
                                       {:dashcard-id dashcard-id
                                        :card-id     card-id
                                        :result      (run-single-card-query
                                                      {:dashboard-id              dashboard-id
                                                       :card-id                   card-id
                                                       :dashcard-id               dashcard-id
                                                       :dashboard-param-id->param dashboard-param-id->param
                                                       :parameters                parameters
                                                       :ignore-cache              ignore-cache
                                                       :context                   context})}))
                                   (or to-query []))]
            (when-not (a/poll! canceled-chan)
              (let [{:keys [dashcard-id card-id result]} result]
                (if (:error result)
                  (do
                    (vswap! failed inc)
                    (write-ndjson-line! os {:type        "card-error"
                                            :dashcard_id dashcard-id
                                            :card_id     card-id
                                            :error       (:error result)}))
                  (do
                    (vswap! succeeded inc)
                    (write-ndjson-line! os {:type        "card-result"
                                            :dashcard_id dashcard-id
                                            :card_id     card-id
                                            :result      result}))))))
          ;; Write completion sentinel
          (let [s @succeeded f @failed]
            (write-ndjson-line! os {:type      "complete"
                                    :total     (+ s f)
                                    :succeeded s
                                    :failed    f})))))))
