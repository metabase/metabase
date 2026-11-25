(ns metabase.mcp.db
  "Application database queries for the MCP module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The one thing that does belong alongside a query is a guard on a value the query splices rather than binds
  — see [[user-id->tenant-id]]. It lives here because here is the only place that knows the value reaches
  HoneySQL."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mcp.permissions :as mcp.perms]
   [metabase.mcp.schema :as mcp.schema]
   [metabase.metabot.usage-controls :as usage-controls]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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
  (mdb/select-batched #(t2/select model :id [:in %]) ids))

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

(defn nullable-fields-with-fingerprints
  "The Fields among `field-ids` the warehouse declares nullable, carrying their `:fingerprint`.
  `field-ids` is expected non-empty — an empty `:in` is a SQL error rather than an empty result,
  so callers guard it."
  [field-ids]
  (mdb/select-batched #(t2/select [:model/Field :id :database_is_nullable :fingerprint]
                                  :id [:in %]
                                  :database_is_nullable true)
                      field-ids))

(defn active-user-ids
  "The ids among `user-ids` of active Users."
  [user-ids]
  (mdb/select-batched-set #(t2/select-pks-set :model/User :id [:in %] :is_active true) user-ids))

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
  (mdb/select-batched-set #(t2/select-pks-set :model/Database {:where [:and [:in :id %] browsable-where]})
                          database-ids))

(defn unarchived-models-in-database
  "The `columns` of the unarchived Models of the Database with `database-id`, in name order."
  [columns database-id]
  (t2/select columns :type :model :database_id database-id :archived false {:order-by [[:%lower.name :asc]]}))

(defn active-tables-by-ids
  "The active Tables with `table-ids`. `table-ids` is expected non-empty — an empty `:in` is a SQL error
  rather than an empty result, so callers guard it."
  [table-ids]
  (mdb/select-batched #(t2/select :model/Table :id [:in %] :active true) table-ids))

(defn active-visible-fields-for-tables
  "The id, name, table id, and position of the active, non-hidden Fields of the Tables with `table-ids`, in
  table position then id order. `table-ids` is expected non-empty — an empty `:in` is a SQL error rather than
  an empty result, so callers guard it."
  [table-ids]
  (vec (sort-by (juxt :position :id)
                (mdb/select-batched #(t2/select [:model/Field :id :name :table_id :position]
                                                :table_id [:in %]
                                                :active true
                                                :visibility_type [:not-in ["hidden" "sensitive" "retired"]]
                                                {:order-by [[:position :asc] [:id :asc]]})
                                    table-ids))))

(defn collections-for-read-check
  "The Collections with `ids`, carrying the columns [[metabase.models.interface/can-read?]] consults.
  `:namespace` and `:type` are selected for that check, not for display."
  [ids]
  (mdb/select-batched #(t2/select [:model/Collection :id :name :namespace :type] :id [:in %]) ids))

(defn collection-id->name+location
  "Map of collection id -> `[name location]` for the Collections with `ids`."
  [ids]
  (mdb/select-batched-map #(t2/select-fn->fn :id (juxt :name :location)
                                             [:model/Collection :id :name :location]
                                             :id [:in %])
                          ids))

(defn snippets-by-archived-state
  "The NativeQuerySnippets in the given archived state, ordered by lower-cased name. Selects only the
  returned columns plus `:collection_id`, which the caller's read check consults — never `:content`,
  which holds the SQL body."
  [archived?]
  (t2/select [:model/NativeQuerySnippet :id :name :description :collection_id]
             :archived (boolean archived?)
             {:order-by [[:%lower.name :asc]]}))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(auth-identity/derive! :provider/mcp :metabase.auth-identity.provider/provider)

(mu/defn insert-feedback!
  "Insert the McpFeedback `row`, returning the number inserted."
  [row :- ::mcp.schema/mcp-feedback.update]
  (t2/insert! :model/McpFeedback row))

(mu/defn insert-session-log!
  "Insert the McpSessionLog `row`."
  [row :- ::mcp.schema/mcp-session-log.create]
  (t2/insert! :model/McpSessionLog row))

(mu/defn end-session-log!
  "Stamp `ended_at` on the McpSessionLog with `session-id`."
  [session-id :- :string]
  (t2/update! :model/McpSessionLog :id [:auto/param session-id] {:ended_at :%now}))

(mu/defn session-log-ids-created-before :- [:sequential :string]
  "The ids of the McpSessionLogs created before `cutoff`."
  [cutoff :- ms/TemporalInstant]
  (vec (t2/select-pks-vec :model/McpSessionLog {:where [:< :created_at [:auto/param cutoff]]})))

(mu/defn insert-tool-call-log!
  "Insert the McpToolCallLog `row`."
  [row :- ::mcp.schema/mcp-tool-call-log.update]
  (t2/insert! :model/McpToolCallLog row))

(mu/defn tool-call-log-ids-created-before :- [:sequential ms/PositiveInt]
  "The ids of the McpToolCallLogs created before `cutoff`."
  [cutoff :- ms/TemporalInstant]
  (vec (t2/select-pks-vec :model/McpToolCallLog {:where [:< :created_at [:auto/param cutoff]]})))

(defn session-user-ids
  "The ids of every User owning a `core_session` with `key-hashed`.

  A set rather than a single id: `key-hashed` derives from the client-supplied `Mcp-Session-Id`, so two users
  can each materialize their own row under one id. Reading a single owner picks one of them arbitrarily and
  locks the rest out of a session they already hold — see `metabase.mcp.session/owned-by-user?`."
  [key-hashed]
  (t2/select-fn-set :user_id (t2/table-name :model/Session) :key_hashed key-hashed))

(mu/defn insert-query-handle!
  "Insert the McpQueryHandle `row` under the client-generated `handle-id`, returning the number inserted."
  [handle-id :- ms/UUIDString
   row       :- ::mcp.schema/mcp-query-handle.update]
  (t2/insert! :model/McpQueryHandle (assoc row :id handle-id)))

(mu/defn query-handle-for-user
  "The McpQueryHandle with `handle-id` whose session belongs to the User with `user-id`, or nil."
  [handle-id :- :string
   user-id   :- ::lib.schema.id/user]
  (t2/select-one :model/McpQueryHandle
                 {:select [:mqh.*]
                  :from   [[(t2/table-name :model/McpQueryHandle) :mqh]]
                  :join   [[(t2/table-name :model/Session) :cs] [:= :cs.id :mqh.core_session_id]]
                  :where  [:and
                           [:= :mqh.id handle-id]
                           [:= :cs.user_id user-id]]}))

(mu/defn query-handle-ids-created-before :- [:sequential :string]
  "The ids of every McpQueryHandle created before `cutoff`."
  [cutoff :- ms/TemporalInstant]
  (vec (t2/select-pks-vec :model/McpQueryHandle {:where [:< :created_at [:auto/param cutoff]]})))

(defn delete-query-handles-for-user-session!
  "Delete the McpQueryHandles of MCP session `mcp-session-id` that belong to the User with `user-id`, plus any
  carrying no `core_session_id` at all. See `metabase.mcp.session/delete!` for why the scoping is needed.

  The subquery is deliberate: resolving those session ids in a separate round trip leaves a window where a
  concurrent teardown drops the session between the two statements."
  [mcp-session-id key-hashed user-id]
  (t2/query {:delete-from (t2/table-name :model/McpQueryHandle)
             :where       [:and
                           [:= :mcp_session_id mcp-session-id]
                           [:or
                            [:= :core_session_id nil]
                            [:in :core_session_id ^:allow-subquery {:select [:id]
                                                                    :from   [(t2/table-name :model/Session)]
                                                                    :where  [:and
                                                                             [:= :key_hashed key-hashed]
                                                                             [:= :user_id user-id]]}]]]}))

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

(defn group-permission-exists?
  "Whether some McpGroupPermission matches `where`, a HoneySQL condition such as `[:in :group_id ids]`."
  [where]
  (t2/exists? :model/McpGroupPermission {:where where}))

(mu/defn group-ids-with-permission :- [:set ms/PositiveInt]
  "The ids among `group-ids` of the groups that have an McpGroupPermission."
  [group-ids :- [:sequential ms/PositiveInt]]
  (into #{} (mdb/select-batched #(t2/select-fn-set :group_id [:model/McpGroupPermission :group_id] :group_id [:in %])
                                group-ids)))

(mu/defn group-permissions
  "The McpGroupPermissions of the groups among `group-ids`."
  [group-ids :- [:sequential ms/PositiveInt]]
  (when (seq group-ids)
    (mdb/select-batched #(t2/select :model/McpGroupPermission :group_id [:in [:auto/param %]]) group-ids)))

(mu/defn insert-group-permissions!
  "Insert the McpGroupPermission `rows` in one statement."
  [rows :- [:sequential [:map {:closed true}
                         [:group_id    ms/PositiveInt]
                         [:mcp_enabled :boolean]
                         [:tool_access ::mcp.perms/tool-access]]]]
  (when (seq rows)
    (t2/insert! :model/McpGroupPermission rows)))

(mu/defn update-group-permissions!
  "Set the McpGroupPermission of the group of each of `rows` to the values of its row, one statement per distinct
  change and partition of groups."
  [rows :- [:sequential [:map {:closed true}
                         [:group_id    ms/PositiveInt]
                         [:mcp_enabled {:optional true} :boolean]
                         [:tool_access {:optional true} ::mcp.perms/tool-access]]]]
  (doseq [[changes rows] (group-by #(dissoc % :group_id) rows)]
    (doseq [chunk (partition-all mdb/update-partition-size (mapv :group_id rows))]
      (t2/update! :model/McpGroupPermission :group_id [:in [:auto/param (vec chunk)]] changes))))

(mu/defn delete-hidden-group-permissions!
  "Delete the McpGroupPermission rows of the groups the mode selected by `advanced?` hides."
  [advanced? :- :boolean]
  (t2/delete! :model/McpGroupPermission
              {:where [:not (usage-controls/visible-groups-clause :group_id advanced?)]}))

(defn user-id->tenant-id
  "Map of user id to `tenant_id` for `user-ids`. An empty collection asks nothing of the
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
  (mdb/select-batched-map #(t2/select-pk->fn :tenant_id :model/User :id [:in %]) user-ids))
