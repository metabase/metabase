(ns metabase.mcp.db
  "Application database queries for the MCP module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The one thing that does belong alongside a query is a guard on a value the query splices rather than binds
  — see [[user-id->tenant-id]]. It lives here because here is the only place that knows the value reaches
  HoneySQL."
  (:require
   [toucan2.core :as t2]))

(defn select-one-by-id
  "The `model` row with primary key `id`, or nil. `id` must already be an integer - ids arriving from an agent
  are resolved to one before they reach here, so a string entity_id is a bug rather than a lookup."
  [model id]
  {:pre [(integer? id)]}
  (t2/select-one model :id id))

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
