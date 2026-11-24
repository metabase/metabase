(ns metabase-enterprise.permission-debug.api
  "`/api/ee/permission_debug/` routes"
  (:require
   [metabase-enterprise.permission-debug.impl :as permission-debug.impl]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.session.core :as session]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/" :- permission-debug.impl/DebuggerSchema
  "This endpoint expects a `user_id`, a `model_id` to debug permissions against, and `action_type`.
  The type of model we are debugging against is inferred by the `action_type`.

  It will return:
  - `decision`: The overall permission decision (\"allow\", \"denied\", or \"limited\")
  - `model-type`: The type of model being checked (e.g., \"question\")
  - `model-id`: The ID of the model being checked
  - `segment`: A set of segmentation types applied (e.g., \"sandboxed\", \"impersonated\", \"routed\")
  - `message`: A sequence of strings explaining the decision
  - `data`: A map containing details about permissions (table or collection names to group names)
  - `suggestions`: A map of group IDs to group names that could provide access

  Example requests:
  - Check if user can read a card: `GET /api/ee/permission_debug?user_id=123&model_id=456&action_type=card/read`
  - Check if user can query a card: `GET /api/ee/permission_debug?user_id=123&model_id=456&action_type=card/query`
  - Check if user can download data: `GET /api/ee/permission_debug?user_id=123&model_id=456&action_type=card/download-data`

  Example responses:
  - Allowed access:
    ```json
    {
      \"decision\": \"allow\",
      \"model-type\": \"question\",
      \"model-id\": \"456\",
      \"segment\": [],
      \"message\": [\"User has permission to read this card\"],
      \"data\": {},
      \"suggestions\": {}
    }
    ```
  - Denied access with blocked table:
    ```json
    {
      \"decision\": \"denied\",
      \"model-type\": \"question\",
      \"model-id\": \"456\",
      \"segment\": [],
      \"message\": [\"User does not have permission to query this card\"],
      \"data\": {\"sample-db.PUBLIC.ORDERS\": [\"All Users\"]},
      \"suggestions\": {}
    }
    ```
  - Limited access:
    ```json
    {
      \"decision\": \"limited\",
      \"model-type\": \"question\",
      \"model-id\": \"456\",
      \"segment\": [],
      \"message\": [\"User has permission to download some data from this card\"],
      \"data\": {},
      \"suggestions\": {}
    }
    ```"
  [_route-params
   {:keys [user_id model_id action_type]
    :or {}} :- [:map {:closed true}
                [:user_id pos-int?]
                [:model_id ms/PositiveInt]
                [:action_type permission-debug.impl/ActionType]]
   _body]
  (permission-debug.impl/debug-permissions
   {:user-id user_id
    :model-id model_id
    :action-type action_type}))

(defn- check-browser-session!
  "Throw a 403 unless `request` is authenticated by a login session, not an API key, and not a full-app embedding
  session."
  [request]
  (api/check (and (:metabase/authed-session-key-hash request)
                  (not= :full-app-embed (:metabase-session-type request)))
             403 {:message    (tru "A preview can only be started from a browser session.")
                  :error-code "preview-requires-browser-session"}))

(api.macros/defendpoint :post "/preview/session" :- [:map
                                                     [:id         ms/PositiveInt]
                                                     [:token      :string]
                                                     [:expires_at :any]]
  "Start a read-only preview as the user `user_id`. Returns the preview's `id` and `token`, which is shown only here:
  send it as the `X-Metabase-Preview-Token` header, and every request that carries it runs as that user. A preview
  lasts 30 minutes, renewed by a request when fewer than 20 are left, and ends with the admin's session."
  [_route-params
   _query-params
   {:keys [user_id]} :- [:map {:closed true}
                         [:user_id ms/PositiveInt]]
   request]
  (check-browser-session! request)
  (session/start-preview! {:user-id                user_id
                           :admin-user-id          api/*current-user-id*
                           :admin-session-key-hash (:metabase/authed-session-key-hash request)}))

(api.macros/defendpoint :delete "/preview/session/:id" :- ::api/generic-204-no-content
  "End the preview `id` that the current admin started."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/check-404 (pos? (session/end-preview! id api/*current-user-id*)))
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/permission_debug` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
