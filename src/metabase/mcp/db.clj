(ns metabase.mcp.db
  "Application database queries for the MCP module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The one thing that does belong alongside a query is a guard on a value the query splices rather than binds
  — see [[user-id->tenant-id]]. It lives here because here is the only place that knows the value reaches
  HoneySQL."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.session.core :as session]
   [toucan2.core :as t2]))

(defn select-one-by-id
  "The `model` row with primary key `id`, or nil. `id` must already be an integer - ids arriving from an agent
  are resolved to one before they reach here, so a string entity_id is a bug rather than a lookup."
  [model id]
  {:pre [(integer? id)]}
  (t2/select-one model :id id))

(defn select-by-ids
  "The `model` rows whose primary keys are in `ids`. `ids` is expected non-empty — an empty `:in` is a SQL
  error rather than an empty result, so callers guard it."
  [model ids]
  (t2/select model :id [:in ids]))

(defn select-users-where
  "The `:model/User` rows matching the HoneySQL `where` clause.

  Takes an assembled clause rather than the values behind it: the clause encodes which users the caller is
  allowed to resolve at all, which is a permission decision and belongs with the permission check."
  [where]
  (t2/select :model/User {:where where}))

(defn table-by-id
  "The Table with `table-id`, or nil. Unlike [[select-one-by-id]], a nil `table-id` is answered with nil
  rather than refused — callers reach here with a column value, not with an id an agent supplied."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn field-types
  "The `base_type` and `effective_type` of the Field with `field-id`, or nil."
  [field-id]
  (t2/select-one [:model/Field :base_type :effective_type] :id field-id))

(defn nullable-fields
  "The id, nullability, and fingerprint of the Fields among `field-ids` the warehouse reports as nullable.
  `field-ids` is expected non-empty — an empty `:in` is a SQL error rather than an empty result, so callers
  guard it."
  [field-ids]
  (t2/select [:model/Field :id :database_is_nullable :fingerprint]
             :id [:in field-ids]
             :database_is_nullable true))

(defn active-user-exists?
  "Whether an active User with `user-id` exists."
  [user-id]
  (t2/exists? :model/User :id user-id :is_active true))

(defn dashboard-parameters
  "The `parameters` of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one-fn :parameters :model/Dashboard :id dashboard-id))

(defn browsable-database
  "The Database with `database-id` restricted by the HoneySQL `browsable-where` clause, or nil.

  Takes an assembled clause rather than the values behind it, for the same reason
  as [[select-users-where]]: which databases an agent may reach at all is a permission decision and
  belongs with the permission check."
  [database-id browsable-where]
  (t2/select-one :model/Database :id database-id {:where browsable-where}))

(defn browsable-databases
  "The `columns` of the Databases matching the HoneySQL `browsable-where` clause, in name order. Naming the
  columns keeps the `details`/`settings` blobs from being decrypted on every row."
  [columns browsable-where]
  (t2/select (into [:model/Database] columns)
             {:where    browsable-where
              :order-by [[:%lower.name :asc]]}))

(defn browsable-database-ids
  "The subset of `database-ids` matching the HoneySQL `browsable-where` clause, as a set. `database-ids` is
  expected non-empty — an empty `:in` is a SQL error rather than an empty result, so callers guard it."
  [database-ids browsable-where]
  (t2/select-pks-set :model/Database {:where [:and [:in :id database-ids] browsable-where]}))

(defn unarchived-models-in-database
  "The `columns` of the unarchived Models of the Database with `database-id`, in name order."
  [columns database-id]
  (t2/select columns :type :model :database_id database-id :archived false {:order-by [[:%lower.name :asc]]}))

(defn active-tables-by-ids
  "The active Tables with `table-ids`. `table-ids` is expected non-empty — an empty `:in` is a SQL error
  rather than an empty result, so callers guard it."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids] :active true))

(defn active-visible-fields-for-tables
  "The id, name, table id, and position of the active, non-hidden Fields of the Tables with `table-ids`, in
  table position then id order. `table-ids` is expected non-empty — an empty `:in` is a SQL error rather than
  an empty result, so callers guard it."
  [table-ids]
  (t2/select [:model/Field :id :name :table_id :position]
             :table_id [:in table-ids]
             :active true
             :visibility_type [:not-in ["hidden" "sensitive" "retired"]]
             {:order-by [[:position :asc] [:id :asc]]}))

(defn collections-for-read-check
  "The Collections with `ids`, carrying the columns [[metabase.models.interface/can-read?]] consults.
  `:namespace` and `:type` are selected for that check, not for display."
  [ids]
  (t2/select [:model/Collection :id :name :namespace :type] :id [:in ids]))

(defn collection-id->name+location
  "Map of collection id -> `[name location]` for the Collections with `ids`."
  [ids]
  (t2/select-fn->fn :id (juxt :name :location)
                    [:model/Collection :id :name :location]
                    :id [:in ids]))

(defn snippets-by-archived-state
  "The NativeQuerySnippets in the given archived state, ordered by lower-cased name. Selects only the
  returned columns plus `:collection_id`, which the caller's read check consults — never `:content`,
  which holds the SQL body."
  [archived?]
  (t2/select [:model/NativeQuerySnippet :id :name :description :collection_id]
             :archived (boolean archived?)
             {:order-by [[:%lower.name :asc]]}))

(defn insert-feedback!
  "Insert the McpFeedback `row`."
  [row]
  (t2/insert! :model/McpFeedback row))

(defn session-user-ids
  "The ids of every User owning a `core_session` with `key-hashed`.

  A set rather than a single id: `key-hashed` derives from the client-supplied `Mcp-Session-Id`, so two users
  can each materialize their own row under one id. Reading a single owner picks one of them arbitrarily and
  locks the rest out of a session they already hold — see `metabase.mcp.session/owned-by-user?`."
  [key-hashed]
  (t2/select-fn-set :user_id :core_session :key_hashed key-hashed))

(defn get-or-create-core-session!
  "The `core_session` row for `key-hashed` and `user-id`, creating one with a freshly generated session id if none
  exists. Uses the raw `:core_session` table (not `:model/Session`) to bypass the after-insert hook, which would
  otherwise publish a spurious `:event/user-login` event."
  [key-hashed user-id]
  (app-db/select-or-insert!
   :core_session
   {:key_hashed key-hashed
    :user_id    user-id}
   (fn []
     {:id              (session/generate-session-id)
      :anti_csrf_token nil
      :created_at      :%now})))

(defn insert-query-handle!
  "Insert the McpQueryHandle `row`."
  [row]
  (t2/insert! :model/McpQueryHandle row))

(defn query-handle-for-user
  "The McpQueryHandle with `handle-id` whose session belongs to the User with `user-id`, or nil."
  [handle-id user-id]
  (t2/select-one :model/McpQueryHandle
                 {:select [:mqh.*]
                  :from   [[:mcp_query_handle :mqh]]
                  :join   [[:core_session :cs] [:= :cs.id :mqh.core_session_id]]
                  :where  [:and
                           [:= :mqh.id handle-id]
                           [:= :cs.user_id user-id]]}))

(defn delete-session-for-user!
  "Delete the `core_session` with `key-hashed` if it belongs to the User with `user-id`."
  [key-hashed user-id]
  (t2/query {:delete-from :core_session
             :where       [:and
                           [:= :key_hashed key-hashed]
                           [:= :user_id user-id]]}))

(defn delete-query-handles-for-user-session!
  "Delete the McpQueryHandles of MCP session `mcp-session-id` that belong to the User with `user-id`, plus any
  carrying no `core_session_id` at all. See `metabase.mcp.session/delete!` for why the scoping is needed.

  The subquery is deliberate: resolving those session ids in a separate round trip leaves a window where a
  concurrent teardown drops the session between the two statements."
  [mcp-session-id key-hashed user-id]
  (t2/query {:delete-from :mcp_query_handle
             :where       [:and
                           [:= :mcp_session_id mcp-session-id]
                           [:or
                            [:= :core_session_id nil]
                            [:in :core_session_id ^:allow-subquery {:select [:id]
                                                                    :from   [:core_session]
                                                                    :where  [:and
                                                                             [:= :key_hashed key-hashed]
                                                                             [:= :user_id user-id]]}]]]}))

(defn delete-query-handles-created-before!
  "Delete the McpQueryHandles created before `cutoff`, answering how many were deleted."
  [cutoff]
  (t2/delete! :model/McpQueryHandle {:where [:< :created_at cutoff]}))

(defn hydrate-moderation-reviews
  "`card` with `:moderation_reviews` hydrated, each review carrying its `:moderator_details`."
  [card]
  (t2/hydrate card [:moderation_reviews :moderator_details]))

(defn notification-by-payload-type
  "The Notification with `id` whose `payload_type` is `payload-type`, or nil."
  [id payload-type]
  (t2/select-one :model/Notification :id id :payload_type payload-type))

(defn subscription-pulse-exists?
  "Whether a Pulse with `pulse-id` exists and is a subscription — a nil `alert_condition` — rather than an alert."
  [pulse-id]
  (t2/exists? :model/Pulse :id pulse-id :alert_condition nil))

(defn hydrate-notification
  "`notification` with its payload, subscriptions, and handler channels and recipients hydrated.

  Spelled out here rather than delegated to `metabase.notification.models/hydrate-notification`, whose
  output schema rejects `payload_type: notification/dashboard` rows — readable on the MCP read path by
  design."
  [notification]
  (t2/hydrate notification
              :payload
              :subscriptions
              [:handlers :channel [:recipients :recipients-detail]]))

(defn user-id->tenant-id
  "Map of user id to `tenant_id` for `user-ids`, in one query. An empty collection asks nothing of the
  database and answers `{}` — `[:in ()]` is not valid SQL.

  Throws unless `user-ids` is a collection of integers. The ids are spliced into an `[:in …]` clause,
  where HoneySQL reads some shapes as syntax rather than as values: a vector is a function call, so
  `[:raw \"1) OR 1=1 --\"]` renders verbatim into the SQL and `[:inline x]` inlines a literal; a map is a
  subquery; a keyword or symbol is an identifier. Those are the injection vectors, and they are refused
  before any SQL is built. Numbers and strings are bound as parameters, so a string id is a plain bug
  rather than a hole — refused all the same, because a silent no-match is a worse answer than a throw.
  The offending values ride `ex-data` rather than the message, so nothing caller-controlled lands in a
  log line.

  `int?` rather than `Long` on purpose: `core_user.id` comes back from JDBC as an `Integer`, so a
  Long-only check would pass its tests and refuse every real call."
  [user-ids]
  (when-not (coll? user-ids)
    (throw (ex-info "MCP: user ids must be a collection of integers" {:user-ids user-ids})))
  (when-let [invalid (seq (remove int? user-ids))]
    (throw (ex-info "MCP: user ids must be a collection of integers" {:invalid (vec invalid)})))
  (if (seq user-ids)
    (t2/select-pk->fn :tenant_id :model/User :id [:in user-ids])
    {}))

(defn existing-transform-tag-ids
  "The subset of `tag-ids` that name a real TransformTag, as a set. `ids` is expected non-empty — an
  empty `:in` is a SQL error rather than an empty result, so callers guard it.

  A set rather than the select's own return: `t2/select-fn-set` answers nil when nothing matches,
  which is exactly the all-unknown case the caller is checking for."
  [tag-ids]
  (into #{} (t2/select-fn-set :id :model/TransformTag :id [:in tag-ids])))
