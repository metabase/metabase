(ns metabase-enterprise.permission-debug.api
  "`/api/ee/permission_debug/` routes"
  (:require
   [metabase-enterprise.permission-debug.explain :as permission-debug.explain]
   [metabase-enterprise.permission-debug.impl :as permission-debug.impl]
   [metabase-enterprise.permission-debug.preview :as preview]
   [metabase-enterprise.permission-debug.preview-grant :as preview-grant]
   [metabase-enterprise.permission-debug.preview-session :as preview-session]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.config.core :as config]
   [metabase.system.core :as system]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/" :- permission-debug.impl/DebuggerSchema
  "This endpoint expects a `user_id`, a `model_id` to debug permissions against, and `action_type`.
  The type of model we are debugging against is inferred by the `action_type`. With `preview_id`, the attribute
  values that preview of the user runs with replace the user's own.

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
  - Check if user can read a dashboard, or query its cards: `action_type=dashboard/read`, `action_type=dashboard/query`
  - Check if user can read a collection: `action_type=collection/read`

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
   {:keys [user_id model_id action_type preview_id]
    :or {}} :- [:map {:closed true}
                [:user_id pos-int?]
                [:model_id ms/PositiveInt]
                [:action_type permission-debug.impl/ActionType]
                [:preview_id {:optional true} ms/NonBlankString]]
   _body]
  (permission-debug.impl/debug-permissions
   {:user-id             user_id
    :model-id            model_id
    :action-type         action_type
    :attribute-overrides (when preview_id
                           (preview/attribute-overrides-of api/*current-user-id* user_id preview_id))}))

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
  call. `preview_id` links this start to its `POST /preview/end`. With `unsaved_edits_id` (from `POST
  /preview/unsaved-edits`), the preview reads those unsaved permission edits as if they were saved."
  [_route-params
   _query-params
   {:keys [principal_type principal_id attributes unsaved_edits_id]}
   :- [:map {:closed true}
       [:principal_type permission-debug.impl/PrincipalType]
       [:principal_id ms/PositiveInt]
       [:attributes {:optional true} [:maybe [:map-of :string :string]]]
       [:unsaved_edits_id {:optional true} [:maybe ms/NonBlankString]]]]
  (permission-debug.impl/start-preview! {:principal-type   principal_type
                                         :principal-id     principal_id
                                         :attributes       attributes
                                         :unsaved-edits-id unsaved_edits_id}))

(def ^:private UnsavedEdit
  "One unsaved edit as the permissions page lists it, kept as sent and shown in a preview tab's \"See changes\"."
  [:map {:closed true}
   [:group_id ms/PositiveInt]
   [:group_name :string]
   [:database_id ms/PositiveInt]
   ;; set when the edit is on one table, unset when it's on the whole database
   [:table_id {:optional true} ms/PositiveInt]
   [:label :string]
   [:permission :string]
   [:before :string]
   [:after :string]])

(api.macros/defendpoint :post "/preview/unsaved-edits" :- [:map [:unsaved_edits_id :string]]
  "Keep the admin's unsaved data permission edits for previews: `groups` as `PUT /api/permissions/graph` takes them,
  and `edits`, the list the preview shows. Nothing is saved: the rows saving them would write are kept in memory, and
  `GET /preview/data`, `GET /preview/table/:table-id` and `POST /preview/start` read them with the returned id."
  [_route-params
   _query-params
   {:keys [groups edits]} :- [:map {:closed true}
                              [:groups [:map-of :metabase.permissions-rest.schema/group-id
                                        [:maybe [:map-of :metabase.permissions-rest.schema/id
                                                 :metabase.permissions-rest.schema/db-perms]]]]
                              [:edits [:sequential UnsavedEdit]]]]
  {:unsaved_edits_id (preview/create-unsaved-edits! api/*current-user-id* groups edits)})

(api.macros/defendpoint :get "/preview/unsaved-edits/:id" :- [:map [:edits [:sequential UnsavedEdit]]]
  "The list of unsaved edits that `POST /preview/unsaved-edits` kept with `id`, for a preview tab's \"See changes\"."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/NonBlankString]]]
  {:edits (:edits (api/check-404 (preview/unsaved-edits-of api/*current-user-id* id)))})

(api.macros/defendpoint :post "/preview/end" :- :map
  "End the preview `preview_id` that `POST /preview/start` (or `/preview/grant`, or `/preview/session`) returned,
  recording it in the audit log with the caller as the actor and `user_id` as the target. Takes the start's principal
  and attribute values, so the end row reads on its own. With `session_token` (a header session) or `session_id` (a
  preview host session), also deletes that preview session.

  Returns `{\"ok\": true}`."
  [_route-params
   _query-params
   {:keys [preview_id user_id principal_type principal_id attributes session_token session_id]}
   :- [:map {:closed true}
       [:preview_id ms/NonBlankString]
       [:user_id ms/PositiveInt]
       [:principal_type permission-debug.impl/PrincipalType]
       [:principal_id ms/PositiveInt]
       [:attributes {:optional true} [:maybe [:map-of :string :string]]]
       [:session_token {:optional true} ms/NonBlankString]
       [:session_id {:optional true} ms/NonBlankString]]]
  (permission-debug.impl/end-preview! {:preview-id     preview_id
                                       :user-id        user_id
                                       :principal-type principal_type
                                       :principal-id   principal_id
                                       :attributes     attributes})
  (when session_token
    (preview-session/end-session! api/*current-user-id* session_token))
  (when session_id
    (preview-session/end-session-by-id! api/*current-user-id* session_id))
  {:ok true})

(api.macros/defendpoint :post "/preview/code" :- [:map
                                                  [:preview_id :string]
                                                  [:session_id :string]
                                                  [:code :string]
                                                  [:code_expires_at :int]
                                                  [:preview_origin :string]
                                                  [:user_id ms/PositiveInt]
                                                  [:user_name :string]]
  "Start previewing a user, group or tenant on the preview host (`MB_PERMISSION_PREVIEW_HOST`), with a session of
  their own that lives in that host's cookie. Takes the same body as `POST /preview/start`, records the start in the
  audit log, and returns what it does plus a one-time `code`, valid until `code_expires_at` (epoch seconds, a minute
  from now), and `preview_origin`. The frame opens `<preview_origin>/preview-session?code=<code>&to=<path>`, which sets
  the cookie and redirects to the content preview at `path`. `POST /preview/end` with `session_id` ends it.

  Only a superuser's own browser session (the `metabase.SESSION` cookie) can get a code."
  [_route-params
   _query-params
   {:keys [principal_type principal_id attributes]} :- [:map {:closed true}
                                                        [:principal_type permission-debug.impl/PrincipalType]
                                                        [:principal_id ms/PositiveInt]
                                                        [:attributes {:optional true} [:maybe [:map-of :string :string]]]]
   {session-key-hash :metabase/authed-session-key-hash, session-type :metabase-session-type}]
  (api/check (and session-key-hash (= :normal session-type))
             [403 "Previewing on the preview host needs a browser session."])
  (let [preview-host                       (api/check (config/config-str :mb-permission-preview-host)
                                                      [400 "No preview host is set (MB_PERMISSION_PREVIEW_HOST)."])
        {:keys [user_id] :as preview}      (permission-debug.impl/start-preview! {:principal-type principal_type
                                                                                  :principal-id   principal_id
                                                                                  :attributes     attributes})
        {:keys [session-id code code-expires-at]} (preview-session/start-host-session! api/*current-user-id*
                                                                                       session-key-hash user_id)]
    (assoc preview
           :session_id      session-id
           :code            code
           :code_expires_at code-expires-at
           :preview_origin  (str (or (some-> ^String (system/site-url) (java.net.URI.) .getScheme) "http") "://" preview-host))))

(api.macros/defendpoint :post "/preview/session" :- [:map
                                                     [:preview_id :string]
                                                     [:session_token :string]
                                                     [:expires_at :int]
                                                     [:user_id ms/PositiveInt]
                                                     [:user_name :string]]
  "Start previewing a user, group or tenant with a session of their own, for a frame that renders the item with the
  SDK. Takes the same body as `POST /preview/start`, records the start in the audit log, and returns what it does plus
  `session_token`, valid until `expires_at` (epoch seconds, renewed while it's used) and only while this browser
  session is. A request sending `X-Metabase-Session: <session_token>` runs as `user_id`, read-only, with the caller
  named in the audit log. `POST /preview/end` with `session_token` ends it.

  Only a superuser's own browser session (the `metabase.SESSION` cookie) can start one."
  [_route-params
   _query-params
   {:keys [principal_type principal_id attributes]} :- [:map {:closed true}
                                                        [:principal_type permission-debug.impl/PrincipalType]
                                                        [:principal_id ms/PositiveInt]
                                                        [:attributes {:optional true} [:maybe [:map-of :string :string]]]]
   {session-key-hash :metabase/authed-session-key-hash, session-type :metabase-session-type}]
  (api/check (and session-key-hash (= :normal session-type))
             [403 "Previewing with a session needs a browser session."])
  (let [{:keys [user_id] :as preview}          (permission-debug.impl/start-preview! {:principal-type principal_type
                                                                                      :principal-id   principal_id
                                                                                      :attributes     attributes})
        {:keys [session-token expires-at]}     (preview-session/start-session! api/*current-user-id* session-key-hash
                                                                               user_id)]
    (assoc preview :session_token session-token :expires_at expires-at)))

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

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/preview/item-scope" :- [:map
                                                       [:name :string]
                                                       [:collection_id [:maybe pos-int?]]
                                                       [:table_ids [:sequential pos-int?]]
                                                       [:whole_database_ids [:sequential pos-int?]]
                                                       [:database_ids [:sequential pos-int?]]]
  "A question's or dashboard's name and collection, read as the admin even in a \"View app as…\" tab, and the tables
  and databases it, or every question on the dashboard, queries. A native question counts as querying its whole
  database."
  [_route-params
   {:keys [card_id dashboard_id]} :- [:and
                                      [:map {:closed true}
                                       [:card_id {:optional true} ms/PositiveInt]
                                       [:dashboard_id {:optional true} ms/PositiveInt]]
                                      [:fn {:error/message "exactly one of card_id or dashboard_id"}
                                       (fn [params] (= 1 (count (keep params [:card_id :dashboard_id]))))]]]
  (permission-debug.impl/item-dependencies card_id dashboard_id))

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
  own value and the group that applies. Runs no query and returns no rows. With `unsaved-edits-id`, as if those
  unsaved edits were saved. With `preview-id` (a user's only), with the attribute values that preview runs with."
  [_route-params
   {:keys [principal-type principal-id unsaved-edits-id preview-id]}
   :- [:map {:closed true}
       [:principal-type permission-debug.impl/PrincipalType]
       [:principal-id ms/PositiveInt]
       [:unsaved-edits-id {:optional true} ms/NonBlankString]
       [:preview-id {:optional true} ms/NonBlankString]]]
  (preview/do-with-unsaved-edits
   api/*current-user-id* unsaved-edits-id
   #(permission-debug.explain/explain-data-access
     {:principal-type      principal-type
      :principal-id        principal-id
      :attribute-overrides (when (and preview-id (= "user" principal-type))
                             (preview/attribute-overrides-of api/*current-user-id* principal-id preview-id))})))

(api.macros/defendpoint :get "/preview/table/:table-id" :- permission-debug.explain/TableUsersResponse
  "What every active user gets on the Table with `table-id`, with the same detail as `GET /preview/data`. With
  `unsaved-edits-id`, as if those unsaved edits were saved."
  [{:keys [table-id]} :- [:map {:closed true}
                          [:table-id ms/PositiveInt]]
   {:keys [unsaved-edits-id]} :- [:map {:closed true}
                                  [:unsaved-edits-id {:optional true} ms/NonBlankString]]]
  (preview/do-with-unsaved-edits api/*current-user-id* unsaved-edits-id
                                 #(permission-debug.explain/explain-table-access-by-user table-id)))

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
