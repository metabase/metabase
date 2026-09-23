(ns metabase-enterprise.data-studio.api.usage-metadata
  "Superuser routes for reviewing deterministic Library recommendations."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.data-studio.api.usage-metadata.representations :as representations]
   [metabase-enterprise.data-studio.api.usage-metadata.schema :as schema]
   [metabase-enterprise.data-studio.usage-metadata.service :as service]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.usage-metadata.candidate-refresh :as candidate-refresh]
   [metabase.usage-metadata.candidate-repository :as candidate-repository]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru]]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def ^:private default-limit 50)
(def ^:private max-limit 200)

(defn- paging
  []
  (let [raw-limit (request/limit)
        limit     (if (and raw-limit (pos? raw-limit)) raw-limit default-limit)]
    (api/check-400 (<= limit max-limit) "limit must not exceed 200")
    {:limit limit, :offset (or (request/offset) 0)}))

(defn- current-candidate!
  [id]
  (api/check-404 (service/current-candidate id)))

(defn- candidate-detail-response
  [candidate]
  (let [{candidate-table :table :as detail} (candidate-repository/candidate-detail candidate)]
    (representations/candidate-detail detail (service/creation-blockers candidate candidate-table))))

(defn- parse-instant
  [s]
  (when s
    (let [parsed (u.date/parse s "UTC")]
      (t/instant (if (instance? java.time.LocalDate parsed)
                   (t/zoned-date-time parsed (t/local-time 0) (t/zone-id "UTC"))
                   parsed)))))

(defn- legacy-queue-filters
  "The `review` and `modeling-status` filters the deprecated `queue` parameter stands for."
  [queue]
  (case queue
    :suggested {:reviews #{:to-review}, :modeling-statuses #{:missing :partially-modeled}}
    :used-raw  {:reviews #{:to-review :discarded}, :modeling-statuses #{:modeled}}
    :discarded {:reviews #{:discarded}, :modeling-statuses #{:missing :partially-modeled}}))

(defn- list-filters
  "Translate list query parameters into repository filters."
  [{:keys [table-id database-id schema table-published candidate-type review modeling-status queue
           last-used-from last-used-to search]}]
  (merge {:table-id         table-id
          :database-id      database-id
          :schema           schema
          :table-published? table-published
          :candidate-types  (not-empty (set candidate-type))
          :last-used-from   (parse-instant last-used-from)
          :last-used-to     (parse-instant last-used-to)
          :search           search}
         (if (and queue (nil? review) (nil? modeling-status))
           (legacy-queue-filters queue)
           {:reviews           (or (not-empty (set review)) #{:to-review})
            :modeling-statuses (not-empty (set modeling-status))})))

(defn- list-sort
  [{:keys [sort-column sort-direction]}]
  (when sort-column
    {:column sort-column, :direction (or sort-direction :asc)}))

(api.macros/defendpoint :get "/candidates" :- ::schema/candidate-page
  "List mined Library cleanup candidates."
  [_route
   params :- schema/candidate-list-query]
  (api/check-superuser)
  (let [{:keys [limit offset] :as page-options} (paging)]
    (if-let [run (candidate-refresh/latest-successful-run)]
      (let [{:keys [rows total]} (candidate-repository/candidate-page
                                  (:id run) (list-filters params) (list-sort params) page-options)]
        (representations/page
         (mapv #(representations/candidate-summary % (:dismissed? %)) rows)
         total limit offset run))
      (representations/page
       [] 0 limit offset nil))))

(api.macros/defendpoint :get "/tables" :- ::schema/table-page
  "List physical tables with mined Library cleanup activity."
  [_route
   params :- schema/table-list-query]
  (api/check-superuser)
  (let [{:keys [limit offset] :as page-options} (paging)]
    (if-let [run (candidate-refresh/latest-successful-run)]
      (let [{:keys [rows total]} (candidate-repository/table-page
                                  (:id run) (list-filters params) (list-sort params) page-options)]
        (representations/page
         (mapv (fn [{:keys [table candidate-count recent-view-count]}]
                 {:table             (representations/table table)
                  :candidate_count   (or candidate-count 0)
                  :recent_view_count recent-view-count})
               rows)
         total limit offset run))
      (representations/page [] 0 limit offset nil))))

(api.macros/defendpoint :get "/candidates/:id" :- ::schema/candidate-detail
  "Return full provenance and Library reconciliation for one candidate."
  [{:keys [id]} :- schema/candidate-id]
  (api/check-superuser)
  (candidate-detail-response (current-candidate! id)))

(api.macros/defendpoint :post "/candidates/:id/dismiss" :- :nil
  "Globally dismiss a semantic candidate."
  [{:keys [id]} :- schema/candidate-id]
  (api/check-superuser)
  (service/dismiss! (current-candidate! id) api/*current-user-id*)
  nil)

(api.macros/defendpoint :delete "/candidates/:id/dismissal" :- :nil
  "Restore a globally dismissed semantic candidate."
  [{:keys [id]} :- schema/candidate-id]
  (api/check-superuser)
  (service/restore! (current-candidate! id))
  nil)

(api.macros/defendpoint :post "/candidates/:id/create" :- ::schema/create-response
  "Create a Measure or Segment from a persisted candidate definition."
  [{:keys [id]} :- schema/candidate-id
   _query
   body :- schema/create-body]
  (api/check-superuser)
  ;; Measure and Segment creation publishes synchronous domain events that perform database work. Keep it outside a
  ;; surrounding transaction so those events retain the same semantics as their normal REST creation endpoints.
  {:id (:id (service/create! (current-candidate! id) body))})

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
    (-> (response/response {:run_id (:id run)})
        (response/status 202))
    (let [run (candidate-refresh/active-run)]
      (service/conflict! "A usage-metadata candidate refresh is already running"
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
