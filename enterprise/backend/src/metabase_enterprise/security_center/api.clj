(ns metabase-enterprise.security-center.api
  "API endpoints for Security Center advisories."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.security-center.models.security-advisory :as security-advisory]
   [metabase-enterprise.security-center.notification :as notification]
   [metabase-enterprise.security-center.schema :as security-center.schema]
   [metabase-enterprise.security-center.settings :as settings]
   [metabase-enterprise.security-center.task.sync-advisories :as sync-advisories]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common :refer [+auth]]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent ExecutorService RejectedExecutionException
                         SynchronousQueue ThreadPoolExecutor ThreadPoolExecutor$AbortPolicy
                         TimeUnit)))

(set! *warn-on-reflection* true)

(defn- advisory-response
  "Format a SecurityAdvisory row for API response. Expects `:acknowledged_by_user` to be hydrated."
  [advisory]
  (-> (select-keys advisory [:advisory_id :title :severity :description :advisory_url :remediation
                             :published_at :match_status :last_evaluated_at
                             :acknowledged_by_user :acknowledged_at :affected_versions])
      (set/rename-keys {:acknowledged_by_user :acknowledged_by})))

(def ^:private AcknowledgedByUser
  "Schema for a hydrated acknowledged_by user map."
  [:map
   [:id          ms/PositiveInt]
   [:common_name ms/NonBlankString]
   [:email       ms/Email]])

(def ^:private AdvisoryResponse
  "Schema for a single advisory in the API response."
  [:map
   [:advisory_id       ::security-center.schema/advisory-id]
   [:title             ms/NonBlankString]
   [:severity          ::security-center.schema/severity]
   [:description       ms/NonBlankString]
   [:advisory_url      [:maybe ms/NonBlankString]]
   [:remediation       ms/NonBlankString]
   [:published_at      ms/TemporalInstant]
   [:match_status      ::security-center.schema/match-status]
   [:last_evaluated_at [:maybe ms/TemporalInstant]]
   [:acknowledged_by   [:maybe AcknowledgedByUser]]
   [:acknowledged_at   [:maybe ms/TemporalInstant]]
   [:affected_versions ::security-center.schema/affected-versions]])

(def ^:private AcknowledgeResponse
  "Schema for the acknowledge endpoint response."
  [:map
   [:advisory_id     ::security-center.schema/advisory-id]
   [:match_status    ::security-center.schema/match-status]
   [:acknowledged_by [:maybe AcknowledgedByUser]]
   [:acknowledged_at [:maybe ms/TemporalInstant]]])

(api.macros/defendpoint :get "/" :- [:map
                                     [:last_checked_at [:maybe ms/TemporalInstant]]
                                     [:advisories [:sequential AdvisoryResponse]]]
  "List all security advisories with match status."
  []
  (api/check-superuser)
  (let [advisories (t2/hydrate (t2/select :model/SecurityAdvisory {:order-by [[:published_at :desc]]})
                               :acknowledged_by_user)]
    {:last_checked_at (settings/security-center-last-synced-at)
     :advisories      (mapv advisory-response advisories)}))

(defn- acknowledge-response
  "Format a slim response for the acknowledge endpoint."
  [advisory]
  (-> (select-keys advisory [:advisory_id :match_status :acknowledged_by_user :acknowledged_at])
      (set/rename-keys {:acknowledged_by_user :acknowledged_by})))

(api.macros/defendpoint :post "/:advisory-id/acknowledge" :- AcknowledgeResponse
  "Acknowledge a security advisory. Stops repeat notifications."
  [{:keys [advisory-id]} :- [:map [:advisory-id ms/NonBlankString]]]
  (api/check-superuser)
  (let [advisory (t2/select-one :model/SecurityAdvisory :advisory_id advisory-id)]
    (api/check-404 advisory)
    (acknowledge-response (security-advisory/acknowledge! advisory api/*current-user-id*))))

(defonce ^:private ^ExecutorService sync-executor
  (ThreadPoolExecutor. 1 1 0 TimeUnit/MILLISECONDS
                       (SynchronousQueue.) (ThreadPoolExecutor$AbortPolicy.)))

(api.macros/defendpoint :post "/sync" :- [:map [:status ms/NonBlankString]]
  "Trigger an async advisory sync + re-evaluation.
   Returns immediately. If a sync is already running, the request is a no-op."
  []
  (api/check-superuser)
  (let [submitted? (try
                     (.submit sync-executor ^Runnable sync-advisories/sync-and-evaluate!)
                     true
                     (catch RejectedExecutionException _e
                       false))]
    {:status (if submitted? "started" "already-in-progress")}))

(api.macros/defendpoint :post "/test-notification" :- [:map [:success :boolean]]
  "Send a test notification through the configured Security Center channels."
  []
  (api/check-superuser)
  (notification/send-test-notification!)
  {:success true})

(def +check-security-center-enabled
  "Middleware that returns 402 if Security Center is not available on this instance."
  (routes.common/wrap-middleware-for-open-api-spec-generation
   (fn [handler]
     (fn [request respond raise]
       (when-not (premium-features/security-center-enabled?)
         (throw (ex-info (tru "Security Center is not available on this instance.")
                         {:status-code 402 :status "error-premium-feature-not-available"})))
       (handler request respond raise)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/security-center` routes."
  (api.macros/ns-handler *ns* +check-security-center-enabled api/+check-superuser +auth))
