(ns metabase-enterprise.cloud-proxy.api
  "`/api/ee/cloud-proxy` endpoints for proxying calls to the Metabase Store."
  (:require
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as m.util]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private superuser-operation-allowlist
  #{"mb-plan-trial-up"
    "mb-plan-trial-up-available"
    "mb-plan-change-plan"
    "mb-plan-change-plan-preview"})

(def ^:private OperationParams
  "Malli schema for the POST body: the parameters of the Harbormaster Store operation named by `:operation-id`.

  Parameters are named in kebab-case only, which is both what the FE sends (see
  `frontend/src/metabase/api/cloud-proxy.ts`) and what the Store client expects. Callers that spell them
  snake_case (`new_plan_alias`) are normalized by [[lib.schema.common/normalize-map]] before validation, so the
  decoded body is forwarded as-is. The parameters span operations rather than being keyed by them because a body
  schema cannot dispatch on the `:operation-id` route param, and each is therefore optional -- the operation
  itself rejects parameters that don't belong to it, or are missing. Adding an operation to the allowlists
  above means adding its parameters here."
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:plan-alias      {:optional true} ms/NonBlankString]
   [:new-plan-alias  {:optional true} ms/NonBlankString]
   [:force-end-trial {:optional true} :boolean]])

(def ^:private non-superuser-operation-allowlist
  #{"list-plans"
    "get-plan"
    "list-addons"})

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:operation-id"
  "Proxy a call to the Metabase Store API via harbormaster client.
   This endpoint is used only for hosted instances, and calls Harbormaster Store using a OpenAPI client.
   :operation-id is the operation-id of the Harbormaster Store endpoint.
   All parameters for the operation are taken in the POST body."
  [{:keys [operation-id]} :- [:map
                              [:operation-id ms/NonBlankString]]
   _query-params
   body :- [:maybe OperationParams]]
  (when-not (premium-features/is-hosted?)
    (throw (ex-info "This endpoint is only available for hosted instances" {:status-code 400})))
  (when-not (contains? (into non-superuser-operation-allowlist superuser-operation-allowlist) operation-id)
    (throw (ex-info "Invalid operation-id" {:status-code 400})))
  (when-not (contains? non-superuser-operation-allowlist operation-id)
    (api/check-superuser))
  (->> body
       (hm.client/call operation-id)
       m.util/deep-snake-keys))

(def routes
  "`/api/ee/cloud-proxy` routes."
  (api.macros/ns-handler *ns* +auth))
