(ns metabase-enterprise.data-studio.api.usage-metadata
  "Superuser routes for reviewing deterministic Library recommendations."
  (:require
   [metabase-enterprise.data-studio.api.usage-metadata.queries :as queries]
   [metabase-enterprise.data-studio.api.usage-metadata.representations :as representations]
   [metabase-enterprise.data-studio.api.usage-metadata.schema :as schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.measures.api :as measures.api]
   [metabase.premium-features.core :as premium-features]
   [metabase.segments.api :as segments.api]
   [metabase.usage-metadata.candidate-mutations :as candidate-mutations]
   [metabase.usage-metadata.candidate-refresh :as candidate-refresh]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- run-refresh-async!
  "TEMPORARY: run a manual refresh without Quartz so it works when the scheduler is disabled."
  [run]
  (u.jvm/in-virtual-thread*
   (try
     (candidate-refresh/run-refresh! run)
     (catch Exception e
       (log/error e "Manual usage-metadata candidate refresh failed")
       (throw e)))))

(defn- conflict!
  [message reason & [data]]
  (throw (ex-info message (merge {:status-code 409, :reason reason} data))))

(defn- require-current-candidate
  [id]
  (let [candidate (api/check-404 (candidate-mutations/candidate id))]
    (when-not (candidate-mutations/candidate-current? candidate)
      (conflict! "Candidate belongs to an obsolete snapshot" :obsolete-snapshot))
    candidate))

(api.macros/defendpoint :get "/candidates" :- ::schema/candidate-page
  "List mined Library cleanup candidates."
  [_route
   opts :- schema/list-query]
  (api/check-superuser)
  (if-let [run (candidate-refresh/latest-successful-run)]
    (let [{:keys [rows total limit offset]} (queries/candidate-page run opts)
          dismissals (queries/dismissal-index rows)]
      (representations/page
       (mapv #(representations/candidate-summary % dismissals) rows)
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
  (queries/candidate-detail (require-current-candidate id)))

(api.macros/defendpoint :post "/candidates/:id/dismiss" :- ::schema/candidate-detail
  "Globally dismiss a semantic candidate."
  [{:keys [id]} :- schema/candidate-id
   _query
   {:keys [reason]} :- schema/dismiss-body]
  (api/check-superuser)
  (let [candidate (require-current-candidate id)]
    (candidate-mutations/dismiss! candidate api/*current-user-id* reason)
    (queries/candidate-detail candidate)))

(api.macros/defendpoint :delete "/candidates/:id/dismissal" :- ::schema/candidate-detail
  "Restore a globally dismissed semantic candidate."
  [{:keys [id]} :- schema/candidate-id]
  (api/check-superuser)
  (let [candidate (require-current-candidate id)]
    (candidate-mutations/restore! candidate)
    (queries/candidate-detail candidate)))

(defn- create-candidate!
  [candidate {:keys [name description] :as overrides}]
  (when-not (contains? #{:measure :segment} (:candidate_type candidate))
    (conflict! "This recommendation does not support direct creation" :unsupported-candidate-action))
  (let [table (api/check-404 (t2/select-one :model/Table :id (:table_id candidate)))]
    (when-not (:active table)
      (conflict! "Candidate table is inactive" :table-inactive))
    (when-not (:is_published table)
      (conflict! "Candidate table is not published in the Library" :table-not-published))
    (when-not (representations/table-editable-for-candidate? candidate table)
      (conflict! "Candidate table cannot be edited" :table-uneditable))
    (if-let [existing (candidate-mutations/exact-existing-entity candidate)]
      (candidate-mutations/mark-modeled! candidate existing)
      (let [body   {:name        (or name (:suggested_name candidate))
                    :description (if (contains? overrides :description)
                                   description
                                   (:suggested_description candidate))
                    :definition  (:definition candidate)}
            entity (case (:candidate_type candidate)
                     :measure (measures.api/create-measure! body)
                     :segment (segments.api/create-segment! body))]
        (candidate-mutations/mark-modeled! candidate entity)))))

(api.macros/defendpoint :post "/candidates/:id/create" :- ::schema/create-response
  "Create a Measure or Segment from a persisted candidate definition."
  [{:keys [id]} :- schema/candidate-id
   _query
   body :- schema/create-body]
  (api/check-superuser)
  (t2/with-transaction [_conn]
    (let [candidate (api/check-404
                     (t2/select-one :model/UsageMetadataCandidate :id id {:for :update}))
          _         (when-not (candidate-mutations/candidate-current? candidate)
                      (conflict! "Candidate belongs to an obsolete snapshot" :obsolete-snapshot))
          entity    (create-candidate! candidate body)]
      {:candidate (queries/candidate-detail (candidate-mutations/candidate id))
       :entity    (representations/created-entity entity)})))

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
