(ns metabase-enterprise.support-access-grants.api
  "API endpoints for managing support access grants."
  (:require
   [metabase-enterprise.support-access-grants.core :as grants]
   [metabase-enterprise.support-access-grants.schema :as grants.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  :- ::grants.schema/grant-response
  "Create a new support access grant.

  Requires superuser permissions. Only one active grant can exist at a time."
  [_route-params
   _query-params
   body :- ::grants.schema/create-grant-request]
  (api/check-superuser)
  (api/create-check :model/SupportAccessGrantLog body)
  (grants/create-grant! api/*current-user-id*
                        (:grant_duration_minutes body)
                        (:ticket_number body)
                        (:notes body)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id/revoke"
  :- ::grants.schema/grant-response
  "Revoke an existing support access grant.

  Requires superuser permissions. Any admin can revoke any grant."
  [{id :id} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/write-check :model/SupportAccessGrantLog id)
  (grants/revoke-grant! api/*current-user-id* id))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  :- ::grants.schema/list-grants-response
  "List support access grants with optional filtering and pagination.

  Requires superuser permissions.

  Query parameters:
  - ticket-number: Filter by ticket number
  - user-id: Filter by user who created the grant
  - include-revoked: Include revoked grants (default false)"
  [_route-params
   {:keys [ticket-number
           user-id
           include-revoked]} :- [:map
                                 [:ticket-number {:optional true} [:maybe :string]]
                                 [:user-id {:optional true} [:maybe ms/PositiveInt]]
                                 [:include-revoked {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (grants/list-grants {:limit (request/limit)
                       :offset (request/offset)
                       :ticket-number ticket-number
                       :user-id user-id
                       :include-revoked include-revoked}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/current"
  :- ::grants.schema/current-grant-response
  "Get the currently active support access grant, if one exists.

  Requires superuser permissions."
  []
  (api/check-superuser)
  (grants/get-current-grant))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/support-access-grant` routes."
  (api.macros/ns-handler *ns* +auth))
