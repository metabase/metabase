(ns metabase-enterprise.cloud-proxy.api
  "`/api/ee/cloud-proxy` endpoints for proxying calls to the Metabase Store."
  (:require
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as m.util]
   [metabase.util.malli.schema :as ms]))

;; Allowlist of valid operation-ids
(def ^:private allowed-operations
  #{"mb-plan-trial-up"
    "mb-plan-trial-up-available"
    "mb-plan-change-plan"
    "mb-plan-change-plan-preview"
    "list-plans"
    "get-plan"
    "list-addons"})

(defn- mock-response
  "Returns mock data for each operation while wiring things together.
   Schemas match harbormaster/server/store/api.clj"
  [operation-id _body]
  (case operation-id
    "mb-plan-trial-up-available"
    {:available  true
     :plan-alias "pro-cloud"}

    "mb-plan-trial-up"
    {:status "ok"}

    "mb-plan-change-plan-preview"
    {:amount-due-now      0,
     :next-payment-amount 57500,
     :next-payment-date   "2026-02-10T12:00:00Z",
     :warnings            nil}

    "mb-plan-change-plan"
    {:instance-status "active"}

    "get-plan"
    {:description           "Metabase Pro Cloud",
     :trial-days            14,
     :token-features        ["database-routing" "snippet-collections" "sso" "metabase-store-managed" "sso-jwt"
                             "sso-saml" "dashboard-subscription-filters" "advanced-config" "whitelabel" "sandboxes"
                             "disable-password-login" "content-verification" "session-timeout-config" "sso-ldap" "cache-preemptive"
                             "scim" "hosting" "content-management" "content-translation" "remote-sync" "sso-google" "collection-cleanup"
                             "embedding-simple" "documents" "audit-app" "no-upsell" "database-auth-providers" "cloud-custom-smtp"
                             "embedding-sdk" "email-restrict-recipients" "advanced-permissions" "cache-granular-controls" "embedding"
                             "upload-management" "official-collections" "offer-metabase-ai-tiered" "serialization" "config-text-file"
                             "dependencies" "tenants" "email-allow-list" "table-data-editing"],
     :name                  "Metabase Pro Cloud",
     :per-user-price        "$12.00",
     :billing-period-months 1,
     :hosting-features      ["custom-domain" "metabase-api-key" "invoicing-eligibility" "can-have-dev-subscription"],
     :product               "prod_K79Voj2md354w8",
     :alias                 "pro-cloud",
     :can-purchase          true,
     :id                    16,
     :users-included        10,
     :price                 "$575.00"}

    ;; Default fallback
    {:operation-id operation-id}))

;; This endpoint is used only for hosted instances, and calls harbormaster using a OpenAPI client.
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:operation-id"
  "Proxy a call to the Metabase Store API via harbormaster client.
   For now returns mock data while wiring things together."
  [{:keys [operation-id]} :- [:map [:operation-id ms/NonBlankString]]
   _query-params
   body :- [:maybe :map]]
  (api/check-superuser)
  (when-not (premium-features/is-hosted?)
    (throw (ex-info "This endpoint is only available for hosted instances"
                    {:status-code 400})))
  (when-not (contains? allowed-operations operation-id)
    (throw (ex-info "Invalid operation-id" {:status-code 400})))
  (->> body
       m.util/deep-kebab-keys
       (hm.client/call operation-id)
       m.util/deep-snake-keys))

(def routes
  "`/api/ee/cloud-proxy` routes."
  (api/+check-superuser (api.macros/ns-handler *ns*)))

;; plan
;; - handle error states from the proxy calls in the FE
;; - add tests for the FE stuff
;;   - all three cases modal (trial up, no trial up + in trial, no trial up + not trial)
;;   - the non-modal/url case
;; - add some basic tests for this endpoint
