(ns metabase.model-persistence.db
  "Application database queries for the model persistence module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.model-persistence.schema :as model-persistence.schema]
   [metabase.tracing.core :as tracing]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn persisted-info-listing
  "Up to `limit` PersistedInfo listing rows (id, database, definition, active, state, error, refresh window,
  table name, creator, card name/archived/type, database name, and collection id/name/authority level) for
  unarchived model Cards, optionally narrowed to `persisted-info-id`, `db-ids`, and/or `card-id`, newest
  refresh first, paginated from `offset` by `limit`."
  [persisted-info-id :- [:maybe ms/PositiveInt]
   db-ids            :- [:maybe [:sequential ::lib.schema.id/database]]
   card-id           :- [:maybe ::lib.schema.id/card]
   limit             :- [:maybe ms/PositiveInt]
   offset            :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/PersistedInfo
             (cond-> {:select    [:p.id :p.database_id :p.definition
                                  :p.active :p.state :p.error
                                  :p.refresh_begin :p.refresh_end
                                  :p.table_name :p.creator_id
                                  :p.card_id [:c.name :card_name]
                                  [:c.archived :card_archived]
                                  [:c.type :card_type]
                                  [:db.name :database_name]
                                  [:col.id :collection_id] [:col.name :collection_name]
                                  [:col.authority_level :collection_authority_level]]
                      :from      [[:persisted_info :p]]
                      :left-join [[:metabase_database :db] [:= :db.id :p.database_id]
                                  [:report_card :c]        [:= :c.id :p.card_id]
                                  [:collection :col]       [:= :c.collection_id :col.id]]
                      :where     [:and
                                  [:= :c.type "model"]
                                  [:= :c.archived false]]
                      :order-by  [[:p.refresh_begin :desc]]}
               persisted-info-id (sql.helpers/where [:= :p.id persisted-info-id])
               (seq db-ids)      (sql.helpers/where [:in :p.database_id db-ids])
               card-id           (sql.helpers/where [:= :p.card_id card-id])
               limit             (sql.helpers/limit limit)
               offset            (sql.helpers/offset offset))))

(mu/defn deletable-prunable-persisted-infos
  "The PersistedInfos in one of `states` for over an hour, or attached to an archived question, or whose
  Card has been deleted — the records [[metabase.model-persistence.task.persist-refresh]] may unpersist."
  [states :- [:set :string]]
  (let [hsql {:select    [:p.*]
              :from      [[:persisted_info :p]]
              :left-join [[:report_card :c] [:= :c.id :p.card_id]]
              :where     [:or
                          [:and
                           [:in :state states]
                           ;; Buffer deletions for an hour if the prune job happens soon after setting
                           ;; state: 1. so people have a chance to change their mind, 2. so a query
                           ;; running against the cache doesn't get ripped out.
                           [:< :state_change_at (h2x/add-interval-honeysql-form (mdb/db-type) :%now -1 :hour)]]
                          [:= :c.type "question"]
                          [:= :c.archived true]
                          ;; card_id is set to null when the corresponding card is deleted
                          [:= :p.card_id nil]]}]
    (tracing/with-span :tasks "task.persist.find-deletable" {:db/statement (tracing/best-effort-sanitize-sql hsql)}
      (t2/select :model/PersistedInfo hsql))))

(mu/defn refreshable-persisted-infos
  "The PersistedInfos of the Database with `database-id` in one of `states` whose Card is an unarchived
  model, plus the Card's `:type`, `:archived`, and `:name`."
  [database-id :- ::lib.schema.id/database
   states      :- [:set :string]]
  (let [hsql {:select    [:p.* :c.type :c.archived :c.name]
              :from      [[:persisted_info :p]]
              :left-join [[:report_card :c] [:= :c.id :p.card_id]]
              :where     [:and
                          [:= :p.database_id database-id]
                          [:in :p.state states]
                          [:= :c.archived false]
                          [:= :c.type "model"]]}]
    (tracing/with-span :tasks "task.persist.find-refreshable" {:db/id database-id
                                                               :db/statement (tracing/best-effort-sanitize-sql hsql)}
      (t2/select :model/PersistedInfo hsql))))

(mu/defn persisted-infos-by-ids
  "The PersistedInfos with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/PersistedInfo :id [:in ids]))

(mu/defn persisted-info
  "The PersistedInfo with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/PersistedInfo :id id))

(mu/defn persisted-info-for-card
  "The PersistedInfo of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/PersistedInfo :card_id card-id))

(mu/defn persisted-info-id-for-card
  "The id of the PersistedInfo of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :id :model/PersistedInfo :card_id card-id))

(mu/defn persisted-info-state
  "The state of the PersistedInfo with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :state :model/PersistedInfo :id id))

(mu/defn persisted-database-ids
  "The set of Database ids with PersistedInfos."
  []
  (t2/select-fn-set :database_id :model/PersistedInfo))

(mu/defn persisted-card-ids-in-states
  "The Card ids among `card-ids` whose PersistedInfo is in one of `states`."
  [card-ids :- [:sequential ::lib.schema.id/card]
   states   :- [:set :string]]
  (t2/select-fn-set :card_id :model/PersistedInfo :card_id [:in card-ids] :state [:in states]))

(mu/defn persisted-model-count-for-databases
  "The number of PersistedInfos of unarchived model Cards of the Databases with `database-ids`."
  [database-ids :- [:or [:set ::lib.schema.id/database] [:sequential ::lib.schema.id/database]]]
  (t2/count :model/PersistedInfo {:from [[:persisted_info :p]]
                                  :join [[:report_card :c] [:= :c.id :p.card_id]]
                                  :where [:and
                                          [:in :p.database_id database-ids]
                                          [:= :c.type "model"]
                                          [:not :c.archived]]}))

(mu/defn insert-persisted-info!
  "Insert the PersistedInfo `row` and return the inserted instance."
  [row :- ::model-persistence.schema/persisted-info.update]
  (t2/insert-returning-instance! :model/PersistedInfo row))

(mu/defn insert-persisted-infos!
  "Insert the PersistedInfo `rows`, returning the number inserted."
  [rows :- [:sequential ::model-persistence.schema/persisted-info.update]]
  (t2/insert! :model/PersistedInfo rows))

(mu/defn update-persisted-info!
  "Apply `changes` to the PersistedInfo with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- ::model-persistence.schema/persisted-info.update]
  (t2/update! :model/PersistedInfo id changes))

(mu/defn begin-persisted-info-refresh!
  "Mark the PersistedInfo with `id` as refreshing `definition` (with `query-hash`), starting now, returning the number
  updated."
  [id         :- ms/PositiveInt
   definition :- [:maybe :map]
   query-hash :- [:maybe :string]]
  (t2/update! :model/PersistedInfo id {:definition      definition
                                       :query_hash      query-hash
                                       :active          false
                                       :refresh_end     nil
                                       :state           "refreshing"}))

(mu/defn end-persisted-info-refresh!
  "Record the outcome of the refresh of the PersistedInfo with `id`: `state` (\"persisted\" or \"error\"), whether
  it is now `active?`, and the `error` message, ended now. Returns the number updated."
  [id      :- ms/PositiveInt
   active? :- :boolean
   state   :- [:enum "persisted" "error"]
   error   :- [:maybe :string]]
  (t2/update! :model/PersistedInfo id {:active active?
                                       :state  state
                                       :error  error}))

(mu/defn deactivate-all-persisted-infos!
  "Deactivate every PersistedInfo and move it to `state`, returning the number updated."
  [state :- :string]
  (t2/update! :model/PersistedInfo {} {:active false, :state state, :state_change_at :%now}))

(mu/defn deactivate-persisted-info!
  "Deactivate the PersistedInfo with `id` and move it to `state`, returning the number updated."
  [id    :- ms/PositiveInt
   state :- :string]
  (t2/update! :model/PersistedInfo id {:active false, :state state, :state_change_at :%now}))

(mu/defn deactivate-persisted-infos-for-database!
  "Deactivate the PersistedInfos of the Database with `database-id` and move them to `state`, returning the
  number updated."
  [database-id :- ::lib.schema.id/database
   state       :- :string]
  (t2/update! :model/PersistedInfo :database_id database-id {:active false, :state state, :state_change_at :%now}))

(mu/defn invalidate-persisted-infos-for-cards!
  "Deactivate the active PersistedInfos of the Cards with `card-ids` and move them back to creating, returning
  the number updated."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/update! :model/PersistedInfo
              {:active true, :card_id [:in card-ids]}
              {:active false, :state "creating", :state_change_at :%now}))

(mu/defn reset-persisted-info-to-creating!
  "Deactivate the PersistedInfo with `id` and move it back to creating, returning the number updated."
  [id :- ms/PositiveInt]
  (t2/update! :model/PersistedInfo id {:active false, :state "creating", :state_change_at :%now}))

(mu/defn ready-deletable-persisted-infos!
  "Move the deletable PersistedInfos of the Database with `database-id` to `state`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   state       :- :string]
  (t2/query-one
   {:update [:persisted_info]
    :where [:and
            [:= :database_id database-id]
            [:= :state "deletable"]]
    :set {:active false,
          :state state,
          :state_change_at :%now}}))

(mu/defn delete-persisted-info!
  "Delete the PersistedInfo with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/PersistedInfo :id id))

(mu/defn unpersisted-models-for-database
  "The model Cards of the Database with `database-id` that have no PersistedInfo."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/Card
             {:where [:and
                      [:= :database_id database-id]
                      [:= :type "model"]
                      [:not [:exists ^:allow-subquery
                             {:select [1]
                              :from [:persisted_info]
                              :where [:= :persisted_info.card_id :report_card.id]}]]]}))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-archived-and-type
  "The archived flag and type of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :archived :type :card_schema] :id card-id))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one :model/Database :id database-id))

(mu/defn databases
  "The Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Database :id [:in database-ids]))

(mu/defn all-databases
  "Every Database."
  []
  (t2/select :model/Database))

(mu/defn update-database!
  "Apply `changes` to the Database with `database-id`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   changes     :- (mut/select-keys ::warehouses.schema/database.update [:settings])]
  (t2/update! :model/Database database-id changes))
