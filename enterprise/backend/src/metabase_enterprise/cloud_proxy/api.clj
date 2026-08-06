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

(def ^:private superuser-operation-allowlist
  #{"mb-plan-trial-up"
    "mb-plan-trial-up-available"
    "mb-plan-change-plan"
    "mb-plan-change-plan-preview"})

(def ^:private OperationParams
  "Malli schema for the POST body: the parameter map of the Harbormaster Store operation named by
  `:operation-id`, forwarded verbatim (via [[m.util/deep-kebab-keys]]) to the Store client. Keys are that
  operation's kebab-case parameter names. Every allowlisted operation takes a flat map of scalars: the FE
  sends `new-plan-alias`/`plan-alias` (strings) and `force-end-trial` (boolean), or an empty body; see
  `frontend/src/metabase/api/cloud-proxy.ts`. An operation taking a nested parameter would have to be added
  to the allowlist above, so it would be caught here at the same time."
  [:map-of :keyword [:maybe [:or :string :boolean number?]]])

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
  [{:keys [operation-id]} :- [:map {:closed true}
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
       m.util/deep-kebab-keys
       (hm.client/call operation-id)
       m.util/deep-snake-keys))

(def routes
  "`/api/ee/cloud-proxy` routes."
  (api.macros/ns-handler *ns*))
