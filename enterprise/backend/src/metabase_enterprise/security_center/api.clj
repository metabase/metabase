(ns metabase-enterprise.security-center.api
  "API endpoints for Security Center advisories."
  (:require
   [metabase-enterprise.security-center.models.security-advisory :as security-advisory]
   [metabase-enterprise.security-center.schema :as security-center.schema]
   [metabase-enterprise.security-center.seed]
   [metabase-enterprise.security-center.settings]
   [metabase-enterprise.security-center.task.sync-advisories :as sync-advisories]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common :refer [+auth]]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- advisory-response
  "Format a SecurityAdvisory row for API response. Expects `:acknowledged_by` to be hydrated."
  [advisory]
  (select-keys advisory [:advisory_id :title :severity :description :advisory_url :remediation
                         :published_at :match_status :last_evaluated_at
                         :acknowledged_by :acknowledged_at :affected_versions]))

;; TODO (Ngoc 2026-03-31) -- tighten `:any` types below once we finalize timestamp and user schemas
(def ^:private AdvisoryResponse
  "Schema for a single advisory in the API response."
  [:map
   [:advisory_id       ms/NonBlankString]
   [:title             ms/NonBlankString]
   [:severity          ::security-center.schema/severity]
   [:description       ms/NonBlankString]
   [:advisory_url      [:maybe ms/NonBlankString]]
   [:remediation       ms/NonBlankString]
   [:published_at      :any]
   [:match_status      ::security-center.schema/match-status]
   [:last_evaluated_at [:maybe :any]]
   [:acknowledged_by   [:maybe :any]]
   [:acknowledged_at   [:maybe :any]]
   [:affected_versions ::security-center.schema/affected-versions]])

(def ^:private AcknowledgeResponse
  "Schema for the acknowledge endpoint response."
  [:map
   [:advisory_id     ms/NonBlankString]
   [:match_status    ::security-center.schema/match-status]
   [:acknowledged_by [:maybe :any]]
   [:acknowledged_at [:maybe :any]]])

(api.macros/defendpoint :get "/" :- [:map
                                     [:last_checked_at [:maybe :any]]
                                     [:advisories [:sequential AdvisoryResponse]]]
  "List all security advisories with match status."
  []
  (let [advisories (t2/hydrate (t2/select :model/SecurityAdvisory {:order-by [[:published_at :desc]]})
                               :acknowledged_by)]
    {:last_checked_at (some :last_evaluated_at advisories)
     :advisories      (mapv advisory-response advisories)}))

(defn- acknowledge-response
  "Format a slim response for the acknowledge endpoint."
  [advisory]
  (select-keys advisory [:advisory_id :match_status :acknowledged_by :acknowledged_at]))

(api.macros/defendpoint :post "/:advisory-id/acknowledge" :- AcknowledgeResponse
  "Acknowledge a security advisory. Stops repeat notifications."
  [{:keys [advisory-id]} :- [:map [:advisory-id ms/NonBlankString]]]
  (let [advisory (t2/select-one :model/SecurityAdvisory :advisory_id advisory-id)]
    (api/check-404 advisory)
    (acknowledge-response (security-advisory/acknowledge! advisory api/*current-user-id*))))

(def ^:private syncing? (atom false))

(api.macros/defendpoint :post "/sync" :- [:map [:status ms/NonBlankString]]
  "Trigger an async advisory sync + re-evaluation.
   Returns immediately. Returns 409 if a sync is already in progress."
  []
  (when-not (compare-and-set! syncing? false true)
    (throw (ex-info (tru "Advisory sync is already in progress.") {:status-code 409})))
  (future
    (try
      (sync-advisories/sync-and-evaluate!)
      (finally
        (reset! syncing? false))))
  {:status "ok"})

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
