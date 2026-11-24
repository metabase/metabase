(ns metabase-enterprise.permission-debug.api
  "`/api/ee/permission_debug/` routes"
  (:require
   [metabase-enterprise.permission-debug.impl :as permission-debug.impl]
   [metabase-enterprise.permission-debug.stand-in :as stand-in]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events.core :as events]
   [metabase.session.core :as session]
   [metabase.users.schema :as users.schema]
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

(defn- check-preview-target!
  "Throw a 400 unless `body` names exactly one target, a user or a group, and picks attribute values only for a group."
  [{:keys [user_id group_id attributes]}]
  (api/check (= 1 (count (filter some? [user_id group_id])))
             400 {:message    (tru "Give either a user or a group to preview.")
                  :error-code "preview-target-invalid"})
  (api/check (or group_id (nil? attributes))
             400 {:message    (tru "Attribute values can only be picked for a group.")
                  :error-code "preview-attributes-need-group"}))

(api.macros/defendpoint :post "/preview/session" :- [:map
                                                     [:id         ms/PositiveInt]
                                                     [:token      :string]
                                                     [:expires_at :any]]
  "Start a read-only preview as the user `user_id`, or as the group `group_id` with the attribute values `attributes`
  that its rules read, through the group's stand-in user: the last preview of a group to start sets the values of
  every open preview of it. Returns the preview's `id` and `token`, which is shown only here: send it as the
  `X-Metabase-Preview-Token` header, and every request that carries it runs as that person. A preview lasts 30 minutes,
  renewed by a request when fewer than 20 are left, and ends with the admin's session."
  [_route-params
   _query-params
   {:keys [user_id group_id attributes] :as body} :- [:map {:closed true}
                                                      [:user_id    {:optional true} ms/PositiveInt]
                                                      [:group_id   {:optional true} ms/PositiveInt]
                                                      [:attributes {:optional true} users.schema/LoginAttributes]]
   request]
  (check-browser-session! request)
  (check-preview-target! body)
  (let [admin-session-key-hash (:metabase/authed-session-key-hash request)
        preview                (if group_id
                                 (stand-in/start-group-preview! {:group-id               group_id
                                                                 :attributes             attributes
                                                                 :admin-user-id          api/*current-user-id*
                                                                 :admin-session-key-hash admin-session-key-hash})
                                 (session/start-preview! {:user-id                user_id
                                                          :admin-user-id          api/*current-user-id*
                                                          :admin-session-key-hash admin-session-key-hash}))]
    (events/publish-event! :event/permission-preview-start
                           {:user-id  api/*current-user-id*
                            :model    (if group_id :model/PermissionsGroup :model/User)
                            :model-id (or group_id user_id)})
    preview))

(api.macros/defendpoint :delete "/preview/session/:id" :- ::api/generic-204-no-content
  "End the preview `id` that the current admin started."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/check-404 (pos? (session/end-preview! id api/*current-user-id*)))
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/permission_debug` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
