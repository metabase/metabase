(ns metabase-enterprise.permission-debug.api
  "`/api/ee/permission_debug/` routes"
  (:require
   [metabase-enterprise.permission-debug.explain :as permission-debug.explain]
   [metabase-enterprise.permission-debug.impl :as permission-debug.impl]
   [metabase-enterprise.permission-debug.preview-grant :as preview-grant]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
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

(api.macros/defendpoint :post "/preview/card/:card-id" :- :map
  "Run the Card with `card-id` as the User with `user_id` would see it: their permissions, attributes, sandboxes,
  connection impersonation and database routing apply. The caller's own session is untouched, and the preview is
  recorded in the audit log with the caller as the actor and the previewed user as the target.

  Returns the query results, in the same shape as `POST /api/card/:card-id/query`."
  [{:keys [card-id]} :- [:map {:closed true}
                         [:card-id ms/PositiveInt]]
   _query-params
   {:keys [user_id]} :- [:map {:closed true}
                         [:user_id ms/PositiveInt]]]
  (permission-debug.impl/preview-card-query {:user-id user_id
                                             :card-id card-id}))

(api.macros/defendpoint :post "/preview/start" :- :map
  "Start previewing the app as a user, group or tenant. Returns the user the preview binds to (a group or tenant
  resolves to its hidden preview user) and the attribute values it carries, and records the start of the preview in
  the audit log. `attributes` sets a group's attribute values; any it leaves out take the most common member value,
  and an empty string means no value. The browser tab then sends `X-Metabase-Preview-As: <user_id>` on every API
  call."
  [_route-params
   _query-params
   {:keys [principal_type principal_id attributes]} :- [:map {:closed true}
                                                        [:principal_type permission-debug.impl/PrincipalType]
                                                        [:principal_id ms/PositiveInt]
                                                        [:attributes {:optional true} [:maybe [:map-of :string :string]]]]]
  (permission-debug.impl/start-preview! {:principal-type principal_type
                                         :principal-id   principal_id
                                         :attributes     attributes}))

(api.macros/defendpoint :post "/preview/grant" :- [:map
                                                   [:grant :string]
                                                   [:expires_at :int]
                                                   [:user_id ms/PositiveInt]
                                                   [:user_name :string]
                                                   [:principal_name :string]
                                                   [:attributes [:map-of :string :string]]]
  "Start previewing a user, group or tenant in the isolated preview frame. Takes the same body as `POST
  /preview/start`, records the start in the audit log, and returns a grant valid for this browser session only, for
  `expires_at` (epoch seconds). The host page's broker sends it as `X-Metabase-Preview-Grant` on each request it makes
  for the frame; the request then runs as `user_id`, read-only.

  Only a superuser's own browser session (the `metabase.SESSION` cookie) can get a grant."
  [_route-params
   _query-params
   {:keys [principal_type principal_id attributes]} :- [:map {:closed true}
                                                        [:principal_type permission-debug.impl/PrincipalType]
                                                        [:principal_id ms/PositiveInt]
                                                        [:attributes {:optional true} [:maybe [:map-of :string :string]]]]
   {session-key-hash :metabase/authed-session-key-hash, session-type :metabase-session-type}]
  (api/check (and session-key-hash (= :normal session-type))
             [403 "Previewing in the preview frame needs a browser session."])
  (let [{:keys [user_id] :as preview} (permission-debug.impl/start-preview! {:principal-type principal_type
                                                                             :principal-id   principal_id
                                                                             :attributes     attributes})
        {:keys [grant expires-at]}    (preview-grant/issue api/*current-user-id* user_id session-key-hash)]
    (assoc preview :grant grant :expires_at expires-at)))

;; the snake_case parameters match the other `permission_debug` endpoints' bodies; `group-id` is the older form
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/preview/attributes" :- [:or
                                                       permission-debug.impl/PreviewAttributesResponse
                                                       permission-debug.impl/AffectingAttributesResponse]
  "The attributes a security rule reads (row-level security, connection impersonation, database routing).

  With `group-id`: the ones the group's access depends on, each with its members' values, the other values to pick
  from, and the default.

  With one of `user_id`, `group_id` or `tenant_id`: the ones the rules on that person's groups read, plus every
  database router's, each with its rules (`uses`), the person's value (a group's or tenant's default), and `applies`,
  false when `card_id` or `dashboard_id` is given and none of the attribute's rules touch the tables or databases it
  queries."
  [_route-params
   {:keys [group-id user_id group_id tenant_id card_id dashboard_id]}
   :- [:and
       [:map {:closed true}
        [:group-id {:optional true} ms/PositiveInt]
        [:user_id {:optional true} ms/PositiveInt]
        [:group_id {:optional true} ms/PositiveInt]
        [:tenant_id {:optional true} ms/PositiveInt]
        [:card_id {:optional true} ms/PositiveInt]
        [:dashboard_id {:optional true} ms/PositiveInt]]
       [:fn {:error/message "exactly one of group-id, user_id, group_id or tenant_id, and at most one of card_id or dashboard_id"}
        (fn [params]
          (and (= 1 (count (keep params [:group-id :user_id :group_id :tenant_id])))
               (> 2 (count (keep params [:card_id :dashboard_id])))))]]]
  (if group-id
    (permission-debug.impl/preview-attributes group-id)
    (permission-debug.impl/affecting-attributes
     {:principal-type (cond user_id "user" group_id "group" tenant_id "tenant")
      :principal-id   (or user_id group_id tenant_id)
      :card-id        card_id
      :dashboard-id   dashboard_id})))

(api.macros/defendpoint :get "/preview/principals" :- permission-debug.explain/PrincipalsResponse
  "Every user, group and tenant an admin can preview permissions as."
  []
  (permission-debug.explain/previewable-principals))

(def ^:private PrincipalParams
  [:map {:closed true}
   [:principal-type permission-debug.impl/PrincipalType]
   [:principal-id ms/PositiveInt]])

(api.macros/defendpoint :get "/preview/data" :- permission-debug.explain/DataAccessResponse
  "What a user, group or tenant gets on every database and table: view data (with row and column security), create
  queries, download results, manage table metadata, manage database and transforms. Each value comes with every group's
  own value and the group that applies. Runs no query and returns no rows."
  [_route-params
   {:keys [principal-type principal-id]} :- PrincipalParams]
  (permission-debug.explain/explain-data-access {:principal-type principal-type
                                                 :principal-id   principal-id}))

(api.macros/defendpoint :get "/preview/table/:table-id" :- permission-debug.explain/TableUsersResponse
  "What every active user gets on the Table with `table-id`, with the same detail as `GET /preview/data`."
  [{:keys [table-id]} :- [:map {:closed true}
                          [:table-id ms/PositiveInt]]]
  (permission-debug.explain/explain-table-access-by-user table-id))

(api.macros/defendpoint :get "/preview/collections" :- permission-debug.explain/CollectionsResponse
  "What a user, group or tenant gets on the collections of one Permissions tab: `default` (Collections), `shared`
  (Shared collections) or `tenant` (Tenant collections)."
  [_route-params
   {:keys [principal-type principal-id namespace]} :- [:map {:closed true}
                                                       [:principal-type permission-debug.impl/PrincipalType]
                                                       [:principal-id ms/PositiveInt]
                                                       [:namespace permission-debug.explain/CollectionNamespace]]]
  (permission-debug.explain/explain-collection-access {:principal-type       principal-type
                                                       :principal-id         principal-id
                                                       :collection-namespace namespace}))

(api.macros/defendpoint :get "/preview/application" :- permission-debug.explain/ApplicationResponse
  "Which application permissions a user, group or tenant gets, and from which group."
  [_route-params
   {:keys [principal-type principal-id]} :- PrincipalParams]
  (permission-debug.explain/explain-application-access {:principal-type principal-type
                                                        :principal-id   principal-id}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/permission_debug` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
