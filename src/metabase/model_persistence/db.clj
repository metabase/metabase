(ns metabase.model-persistence.db
  "Application database queries for the model persistence module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.tracing.core :as tracing]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private PersistedInfoRow
  "A whole PersistedInfo row for insert."
  [:map {:closed true}
   [:database_id     {:optional true} :any]
   [:card_id         {:optional true} :any]
   [:question_slug   {:optional true} :any]
   [:table_name      {:optional true} :any]
   [:definition      {:optional true} :any]
   [:query_hash      {:optional true} :any]
   [:active          {:optional true} :any]
   [:state           {:optional true} :any]
   [:refresh_begin   {:optional true} :any]
   [:refresh_end     {:optional true} :any]
   [:state_change_at {:optional true} :any]
   [:error           {:optional true} :any]
   [:creator_id      {:optional true} :any]])

(mu/defn persisted-info-listing :- [:sequential (ms/InstanceOf :model/PersistedInfo)]
  "Up to `limit` PersistedInfo listing rows (id, database, definition, active, state, error, refresh window,
  table name, creator, card name/archived/type, database name, and collection id/name/authority level) for
  unarchived model Cards, optionally narrowed to `persisted-info-id`, `db-ids`, and/or `card-id`, newest
  refresh first, paginated from `offset` by `limit`."
  [persisted-info-id :- [:maybe ms/PositiveInt]
   db-ids            :- [:maybe [:seqable ms/PositiveInt]]
   card-id           :- [:maybe ms/PositiveInt]
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

(mu/defn deletable-prunable-persisted-infos :- [:sequential (ms/InstanceOf :model/PersistedInfo)]
  "The PersistedInfos in one of `states` for over an hour, or attached to an archived question, or whose
  Card has been deleted — the records [[metabase.model-persistence.task.persist-refresh]] may unpersist."
  [states :- [:seqable :string]]
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

(mu/defn refreshable-persisted-infos :- [:sequential (ms/InstanceOf :model/PersistedInfo)]
  "The PersistedInfos of the Database with `database-id` in one of `states` whose Card is an unarchived
  model, plus the Card's `:type`, `:archived`, and `:name`."
  [database-id :- ms/PositiveInt
   states      :- [:seqable :string]]
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

(mu/defn persisted-infos-by-ids :- [:sequential (ms/InstanceOf :model/PersistedInfo)]
  "The PersistedInfos with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/PersistedInfo :id [:in ids]))

(mu/defn persisted-info :- [:maybe (ms/InstanceOf :model/PersistedInfo)]
  "The PersistedInfo with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/PersistedInfo :id id))

(mu/defn persisted-info-for-card :- [:maybe (ms/InstanceOf :model/PersistedInfo)]
  "The PersistedInfo of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/PersistedInfo :card_id card-id))

(mu/defn persisted-info-id-for-card :- [:maybe ms/PositiveInt]
  "The id of the PersistedInfo of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one-fn :id :model/PersistedInfo :card_id card-id))

(mu/defn persisted-info-state :- [:maybe :string]
  "The state of the PersistedInfo with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :state :model/PersistedInfo :id id))

(mu/defn persisted-database-ids :- [:maybe [:set ms/PositiveInt]]
  "The set of Database ids with PersistedInfos."
  []
  (t2/select-fn-set :database_id :model/PersistedInfo))

(mu/defn persisted-card-ids-in-states :- [:maybe [:set ms/PositiveInt]]
  "The Card ids among `card-ids` whose PersistedInfo is in one of `states`."
  [card-ids :- [:seqable ms/PositiveInt]
   states   :- [:seqable :string]]
  (t2/select-fn-set :card_id :model/PersistedInfo :card_id [:in card-ids] :state [:in states]))

(mu/defn persisted-model-count-for-databases :- ms/IntGreaterThanOrEqualToZero
  "The number of PersistedInfos of unarchived model Cards of the Databases with `database-ids`."
  [database-ids :- [:seqable ms/PositiveInt]]
  (t2/count :model/PersistedInfo {:from [[:persisted_info :p]]
                                  :join [[:report_card :c] [:= :c.id :p.card_id]]
                                  :where [:and
                                          [:in :p.database_id database-ids]
                                          [:= :c.type "model"]
                                          [:not :c.archived]]}))

(mu/defn insert-persisted-info! :- (ms/InstanceOf :model/PersistedInfo)
  "Insert the PersistedInfo `row` and return the inserted instance."
  [row :- PersistedInfoRow]
  (t2/insert-returning-instance! :model/PersistedInfo row))

(mu/defn insert-persisted-infos! :- :int
  "Insert the PersistedInfo `rows`, returning the number inserted."
  [rows :- [:seqable PersistedInfoRow]]
  (t2/insert! :model/PersistedInfo rows))

(mu/defn update-persisted-info! :- :int
  "Apply `changes` to the PersistedInfo with `id`, returning the number updated."
  [id      :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:definition      {:optional true} :any]
               [:query_hash      {:optional true} [:maybe :string]]
               [:active          {:optional true} :boolean]
               [:refresh_begin   {:optional true} :any]
               [:refresh_end     {:optional true} :any]
               [:state           {:optional true} :string]
               [:state_change_at {:optional true} :any]
               [:error           {:optional true} [:maybe :string]]]]
  (t2/update! :model/PersistedInfo id changes))

(mu/defn deactivate-all-persisted-infos! :- :int
  "Deactivate every PersistedInfo and move it to `state`, returning the number updated."
  [state :- :string]
  (t2/update! :model/PersistedInfo {} {:active false, :state state, :state_change_at :%now}))

(mu/defn deactivate-persisted-info! :- :int
  "Deactivate the PersistedInfo with `id` and move it to `state`, returning the number updated."
  [id    :- ms/PositiveInt
   state :- :string]
  (t2/update! :model/PersistedInfo id {:active false, :state state, :state_change_at :%now}))

(mu/defn deactivate-persisted-infos-for-database! :- :int
  "Deactivate the PersistedInfos of the Database with `database-id` and move them to `state`, returning the
  number updated."
  [database-id :- ms/PositiveInt
   state       :- :string]
  (t2/update! :model/PersistedInfo :database_id database-id {:active false, :state state, :state_change_at :%now}))

(mu/defn invalidate-persisted-infos-for-cards! :- :int
  "Deactivate the active PersistedInfos of the Cards with `card-ids` and move them back to creating, returning
  the number updated."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/update! :model/PersistedInfo
              {:active true, :card_id [:in card-ids]}
              {:active false, :state "creating", :state_change_at :%now}))

(mu/defn reset-persisted-info-to-creating! :- :int
  "Deactivate the PersistedInfo with `id` and move it back to creating, returning the number updated."
  [id :- ms/PositiveInt]
  (t2/update! :model/PersistedInfo id {:active false, :state "creating", :state_change_at :%now}))

(mu/defn ready-deletable-persisted-infos! :- :int
  "Move the deletable PersistedInfos of the Database with `database-id` to `state`, returning the number updated."
  [database-id :- ms/PositiveInt
   state       :- :string]
  (t2/query-one
   {:update [:persisted_info]
    :where [:and
            [:= :database_id database-id]
            [:= :state "deletable"]]
    :set {:active false,
          :state state,
          :state_change_at :%now}}))

(mu/defn delete-persisted-info! :- :int
  "Delete the PersistedInfo with `id`, returning the number deleted."
  [id :- ms/PositiveInt]
  (t2/delete! :model/PersistedInfo :id id))

(mu/defn unpersisted-models-for-database :- [:sequential (ms/InstanceOf :model/Card)]
  "The model Cards of the Database with `database-id` that have no PersistedInfo."
  [database-id :- ms/PositiveInt]
  (t2/select :model/Card
             {:where [:and
                      [:= :database_id database-id]
                      [:= :type "model"]
                      [:not [:exists ^:allow-subquery
                             {:select [1]
                              :from [:persisted_info]
                              :where [:= :persisted_info.card_id :report_card.id]}]]]}))

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-archived-and-type :- [:maybe [:map {:closed true}
                                            [:archived    :boolean]
                                            [:type        :keyword]
                                            [:card_schema :int]]]
  "The archived flag and type of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one [:model/Card :archived :type :card_schema] :id card-id))

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database :id database-id))

(mu/defn databases :- [:sequential (ms/InstanceOf :model/Database)]
  "The Databases with `database-ids`."
  [database-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Database :id [:in database-ids]))

(mu/defn all-databases :- [:sequential (ms/InstanceOf :model/Database)]
  "Every Database."
  []
  (t2/select :model/Database))

(mu/defn update-database! :- :int
  "Apply `changes` to the Database with `database-id`, returning the number updated."
  [database-id :- ms/PositiveInt
   changes     :- [:map {:closed true}
                   [:settings {:optional true} [:maybe :map]]]]
  (t2/update! :model/Database database-id changes))
