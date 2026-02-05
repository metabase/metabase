(ns metabase-enterprise.cloud-proxy.api
  "`/api/ee/cloud-proxy` endpoints for proxying calls to the Metabase Store."
  (:require
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as m.util]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;; Allowlist of superuser operation-ids
(def ^:private allowed-superuser-operations
  #{"mb-plan-trial-up"
    "mb-plan-trial-up-available"
    "mb-plan-change-plan"
    "mb-plan-change-plan-preview"})

;; Allowlist of non-superuser operation-ids
(def ^:private allowed-public-operations
  #{"list-plans"
    "get-plan"
    "list-addons"})

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:operation-id"
  "Proxy a call to the Metabase Store API via harbormaster client.
   This endpoint is used only for hosted instances, and calls Harbormaster Store using a OpenAPI client.
   :operation-id is the operation-id of the Harbormaster Store endpoint.
   All parameters for the operation are taken in the POST body."
  [{:keys [operation-id]} :- [:map [:operation-id ms/NonBlankString]]
   _query-params
   body :- [:maybe :map]]
  (when-not (premium-features/is-hosted?)
    (throw (ex-info "This endpoint is only available for hosted instances" {:status-code 400})))
  (when-not (contains? (into allowed-public-operations allowed-superuser-operations) operation-id)
    (throw (ex-info "Invalid operation-id" {:status-code 400})))
  (when-not (contains? allowed-public-operations operation-id)
    (api/check-superuser))
  (->> body
       m.util/deep-kebab-keys
       (hm.client/call operation-id)
       m.util/deep-snake-keys))

(def routes
  "`/api/ee/cloud-proxy` routes."
  (api.macros/ns-handler *ns*))
