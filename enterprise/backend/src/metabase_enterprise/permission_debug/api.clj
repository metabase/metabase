(ns metabase-enterprise.permission-debug.api
  "`/api/ee/permission_debug/` routes"
  (:require
   [metabase-enterprise.permission-debug.impl :as permission-debug.impl]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

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
    :or {}} :- [:map
                [:user_id pos-int?]
                [:model_id :string]
                [:action_type permission-debug.impl/ActionType]]
   _body]
  (permission-debug.impl/debug-permissions
   {:user-id user_id
    :model-id model_id
    :action-type action_type}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/permission_debug` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
