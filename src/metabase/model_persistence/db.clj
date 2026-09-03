(ns metabase.model-persistence.db
  "Application database queries for the model persistence module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn persisted-infos
  "The PersistedInfos selected by the Honey SQL `query`."
  [query]
  (t2/select :model/PersistedInfo query))

(defn persisted-infos-by-ids
  "The PersistedInfos with `ids`."
  [ids]
  (t2/select :model/PersistedInfo :id [:in ids]))

(defn persisted-info
  "The PersistedInfo with `id`, or nil."
  [id]
  (t2/select-one :model/PersistedInfo :id id))

(defn persisted-info-for-card
  "The PersistedInfo of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/PersistedInfo :card_id card-id))

(defn persisted-info-id-for-card
  "The id of the PersistedInfo of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one-fn :id :model/PersistedInfo :card_id card-id))

(defn persisted-info-state
  "The state of the PersistedInfo with `id`, or nil."
  [id]
  (t2/select-one-fn :state :model/PersistedInfo :id id))

(defn persisted-database-ids
  "The set of Database ids with PersistedInfos."
  []
  (t2/select-fn-set :database_id :model/PersistedInfo))

(defn persisted-card-ids-in-states
  "The Card ids among `card-ids` whose PersistedInfo is in one of `states`."
  [card-ids states]
  (t2/select-fn-set :card_id :model/PersistedInfo :card_id [:in card-ids] :state [:in states]))

(defn persisted-model-count-for-databases
  "The number of PersistedInfos of unarchived model Cards of the Databases with `database-ids`."
  [database-ids]
  (t2/count :model/PersistedInfo {:from [[:persisted_info :p]]
                                  :join [[:report_card :c] [:= :c.id :p.card_id]]
                                  :where [:and
                                          [:in :p.database_id database-ids]
                                          [:= :c.type "model"]
                                          [:not :c.archived]]}))

(defn insert-persisted-info!
  "Insert the PersistedInfo `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/PersistedInfo row))

(defn insert-persisted-infos!
  "Insert the PersistedInfo `rows`."
  [rows]
  (t2/insert! :model/PersistedInfo rows))

(defn update-persisted-info!
  "Apply `changes` to the PersistedInfo with `id`."
  [id changes]
  (t2/update! :model/PersistedInfo id changes))

(defn deactivate-persisted-infos!
  "Deactivate the PersistedInfos matching `conditions` and move them to `state`."
  [conditions state]
  (t2/update! :model/PersistedInfo conditions {:active false, :state state, :state_change_at :%now}))

(defn invalidate-persisted-infos!
  "Deactivate the active PersistedInfos matching `conditions` and move them back to creating."
  [conditions]
  (t2/update! :model/PersistedInfo
              (merge {:active true} conditions)
              {:active false, :state "creating", :state_change_at :%now}))

(defn reset-persisted-info-to-creating!
  "Deactivate the PersistedInfo with `id` and move it back to creating."
  [id]
  (t2/update! :model/PersistedInfo id {:active false, :state "creating", :state_change_at :%now}))

(defn ready-deletable-persisted-infos!
  "Move the deletable PersistedInfos of the Database with `database-id` to `state`."
  [database-id state]
  (t2/query-one
   {:update [:persisted_info]
    :where [:and
            [:= :database_id database-id]
            [:= :state "deletable"]]
    :set {:active false,
          :state state,
          :state_change_at :%now}}))

(defn delete-persisted-info!
  "Delete the PersistedInfo with `id`."
  [id]
  (t2/delete! :model/PersistedInfo :id id))

(defn unpersisted-models-for-database
  "The model Cards of the Database with `database-id` that have no PersistedInfo."
  [database-id]
  (t2/select :model/Card
             {:where [:and
                      [:= :database_id database-id]
                      [:= :type "model"]
                      [:not [:exists ^:allow-subquery
                             {:select [1]
                              :from [:persisted_info]
                              :where [:= :persisted_info.card_id :report_card.id]}]]]}))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn card-archived-and-type
  "The archived flag and type of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :archived :type :card_schema] :id card-id))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn databases
  "The Databases with `database-ids`."
  [database-ids]
  (t2/select :model/Database :id [:in database-ids]))

(defn all-databases
  "Every Database."
  []
  (t2/select :model/Database))

(defn update-database!
  "Apply `changes` to the Database with `database-id`."
  [database-id changes]
  (t2/update! :model/Database database-id changes))
