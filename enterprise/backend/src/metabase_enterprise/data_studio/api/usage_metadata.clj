(ns metabase-enterprise.data-studio.api.usage-metadata
  "Superuser routes for reviewing deterministic Library recommendations."
  (:require
   [metabase-enterprise.data-studio.api.usage-metadata.queries :as queries]
   [metabase-enterprise.data-studio.api.usage-metadata.representations :as representations]
   [metabase-enterprise.data-studio.api.usage-metadata.schema :as schema]
   [metabase-enterprise.data-studio.usage-metadata.service :as service]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.premium-features.core :as premium-features]
   [metabase.usage-metadata.candidate-refresh :as candidate-refresh]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn- run-refresh-async!
  "TEMPORARY: run a manual refresh without Quartz so it works when the scheduler is disabled."
  [run]
  (u.jvm/in-virtual-thread*
   (try
     (candidate-refresh/run-refresh! run)
     (catch Throwable e
       (log/error e "Manual usage-metadata candidate refresh failed")
       (throw e)))))

(defn- conflict!
  [message reason & [data]]
  (throw (ex-info message (merge {:status-code 409, :reason reason} data))))

(defn- current-candidate!
  [id]
  (api/check-404 (service/current-candidate id)))

(defn- candidate-detail-response
  [candidate]
  (let [{candidate-table :table :as detail} (queries/candidate-detail candidate)]
    (representations/candidate-detail detail (service/creation-blockers candidate candidate-table))))

(api.macros/defendpoint :get "/candidates" :- ::schema/candidate-page
  "List mined Library cleanup candidates."
  [_route
   opts :- schema/list-query]
  (api/check-superuser)
  (if-let [run (candidate-refresh/latest-successful-run)]
    (let [{:keys [rows total limit offset]} (queries/candidate-page run opts)
          dismissals (queries/dismissal-index rows)]
      (representations/page
       (mapv #(representations/candidate-summary % (queries/dismissed? dismissals %)) rows)
       total limit offset run))
    (let [{:keys [limit offset]} (queries/paging)]
      (representations/page [] 0 limit offset nil))))

(api.macros/defendpoint :get "/tables" :- ::schema/table-page
  "List physical tables with mined Library cleanup activity."
  [_route
   opts :- schema/list-query]
  (api/check-superuser)
  (if-let [run (candidate-refresh/latest-successful-run)]
    (let [{:keys [rows total limit offset]} (queries/table-page run opts)
          tables (queries/table-index (into #{} (map :table_id) rows))]
      (representations/page
       (mapv (fn [row]
               {:table (representations/table (tables (:table_id row)))
                :candidate_count (or (:candidate_count row) 0)})
             rows)
       total limit offset run))
    (let [{:keys [limit offset]} (queries/paging)]
      (representations/page [] 0 limit offset nil))))

(api.macros/defendpoint :get "/candidates/:id" :- ::schema/candidate-detail
  "Return full provenance and Library reconciliation for one candidate."
  [{:keys [id]} :- schema/candidate-id]
  (api/check-superuser)
  (candidate-detail-response (current-candidate! id)))

(api.macros/defendpoint :post "/candidates/:id/dismiss" :- ::schema/candidate-detail
  "Globally dismiss a semantic candidate."
  [{:keys [id]} :- schema/candidate-id]
  (api/check-superuser)
  (let [candidate (current-candidate! id)]
    (service/dismiss! candidate api/*current-user-id*)
    (candidate-detail-response candidate)))

(api.macros/defendpoint :delete "/candidates/:id/dismissal" :- ::schema/candidate-detail
  "Restore a globally dismissed semantic candidate."
  [{:keys [id]} :- schema/candidate-id]
  (api/check-superuser)
  (let [candidate (current-candidate! id)]
    (service/restore! candidate)
    (candidate-detail-response candidate)))

(api.macros/defendpoint :post "/candidates/:id/create" :- ::schema/create-response
  "Create a Measure or Segment from a persisted candidate definition."
  [{:keys [id]} :- schema/candidate-id
   _query
   body :- schema/create-body]
  (api/check-superuser)
  ;; Measure and Segment creation publishes synchronous domain events that perform database work. Keep it outside a
  ;; surrounding transaction so those events retain the same semantics as their normal REST creation endpoints.
  (let [candidate (current-candidate! id)
        entity    (service/create! candidate body)]
    {:candidate (candidate-detail-response (current-candidate! id))
     :entity    (representations/created-entity entity)}))

(api.macros/defendpoint :get "/refresh" :- ::schema/refresh-status
  "Return candidate refresh and snapshot status."
  []
  (api/check-superuser)
  (let [{:keys [snapshot active failure]} (candidate-refresh/refresh-status)]
    {:snapshot (representations/snapshot snapshot)
     :active   (representations/run-state active)
     :failure  (representations/run-state failure)}))

(api.macros/defendpoint :post "/refresh" :- ::schema/start-refresh-response
  "Queue a candidate refresh."
  []
  (api/check-superuser)
  (if-let [run (candidate-refresh/queue-refresh! :manual api/*current-user-id*)]
    (do
      (run-refresh-async! run)
      (-> (response/response {:run_id (:id run)})
          (response/status 202)))
    (let [run (candidate-refresh/active-run)]
      (conflict! "A usage-metadata candidate refresh is already running"
                 :refresh-already-active
                 {:run-id (:id run)}))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/data-studio/usage-metadata` routes."
  (let [handler (api.macros/ns-handler *ns* +auth)]
    (open-api/handler-with-open-api-spec
     (fn [request respond raise]
       (premium-features/assert-has-feature :library (deferred-tru "Library"))
       (handler request respond raise))
     (fn [prefix]
       (open-api/open-api-spec handler prefix)))))
