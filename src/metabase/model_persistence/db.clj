(ns metabase.model-persistence.db
  "Application database queries for the model persistence module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.model-persistence.schema :as model-persistence.schema]
   [metabase.tracing.core :as tracing]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which PersistedInfos a query applies to. Keys mirror the columns of `persisted_info`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:id          {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:card_id     {:optional true} [:or ::lib.schema.id/card [:set ::lib.schema.id/card]]]
   [:database_id {:optional true} [:or ::lib.schema.id/database [:set ::lib.schema.id/database]]]
   [:state       {:optional true} [:or :string [:set :string]]]
   [:active      {:optional true} :boolean]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::model-persistence.schema/persisted-info.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::model-persistence.schema/persisted-info.column
                                              [:tuple ::model-persistence.schema/persisted-info.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/PersistedInfo columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-persisted-infos :- [:sequential ::model-persistence.schema/persisted-info.partial]
  "The PersistedInfos matching `opts`."
  ([]
   (select-persisted-infos nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-persisted-info :- [:maybe ::model-persistence.schema/persisted-info.partial]
  "The first PersistedInfo matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::opts]]
  (apply t2/select-one (->model columns) (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-persisted-info! :- ::model-persistence.schema/persisted-info
  "Insert the PersistedInfo `row` and return the inserted instance."
  [row :- ::model-persistence.schema/persisted-info.create]
  (t2/insert-returning-instance! :model/PersistedInfo row))

(mu/defn insert-persisted-infos! :- :int
  "Insert the PersistedInfo `rows`, returning the number inserted."
  [rows :- [:sequential ::model-persistence.schema/persisted-info.create]]
  (t2/insert! :model/PersistedInfo rows))

(mu/defn update-persisted-infos! :- :int
  "Apply `changes` to every PersistedInfo matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::model-persistence.schema/persisted-info.update]
  (apply t2/update! :model/PersistedInfo (conj (->kv-args opts) changes)))

(mu/defn delete-persisted-infos! :- :int
  "Delete every PersistedInfo matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/PersistedInfo (->args opts)))

;;; ------------------------------- Queries used only by the model-persistence module -------------------------------

(mu/defn select-persisted-info-listing
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

(mu/defn select-deletable-prunable-persisted-infos
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

(mu/defn select-refreshable-persisted-infos
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

(mu/defn select-persisted-info-database-ids :- [:set ::lib.schema.id/database]
  "The set of Database ids with PersistedInfos."
  []
  (or (t2/select-fn-set :database_id :model/PersistedInfo) #{}))

(mu/defn select-persisted-info-card-ids-in-states :- [:set ::lib.schema.id/card]
  "The Card ids among `card-ids` whose PersistedInfo is in one of `states`."
  [card-ids :- [:sequential ::lib.schema.id/card]
   states   :- [:set :string]]
  (or (apply t2/select-fn-set :card_id :model/PersistedInfo (->args {:card_id (set card-ids), :state states})) #{}))

(mu/defn count-persisted-models-for-databases :- :int
  "The number of PersistedInfos of unarchived model Cards of the Databases with `database-ids`."
  [database-ids :- [:or [:set ::lib.schema.id/database] [:sequential ::lib.schema.id/database]]]
  (t2/count :model/PersistedInfo {:from [[:persisted_info :p]]
                                  :join [[:report_card :c] [:= :c.id :p.card_id]]
                                  :where [:and
                                          [:in :p.database_id database-ids]
                                          [:= :c.type "model"]
                                          [:not :c.archived]]}))

(mu/defn update-persisted-info-refresh-begun! :- :int
  "Mark the PersistedInfo with `id` as refreshing `definition` (with `query-hash`), starting now, returning the
  number updated."
  [id         :- ms/PositiveInt
   definition :- [:maybe ::model-persistence.schema/persisted-info.definition]
   query-hash :- [:maybe :string]]
  (update-persisted-infos! {:id id} {:definition  definition
                                     :query_hash  query-hash
                                     :active      false
                                     :refresh_end nil
                                     :state       "refreshing"}))

(mu/defn update-persisted-info-refresh-ended! :- :int
  "Record the outcome of the refresh of the PersistedInfo with `id`: `state` (\"persisted\" or \"error\"), whether
  it is now `active?`, and the `error` message. Returns the number updated."
  [id      :- ms/PositiveInt
   active? :- :boolean
   state   :- [:enum "persisted" "error"]
   error   :- [:maybe :string]]
  (update-persisted-infos! {:id id} {:active active?
                                     :state  state
                                     :error  error}))

(mu/defn update-all-persisted-infos-deactivated! :- :int
  "Deactivate every PersistedInfo and move it to `state`, returning the number updated."
  [state :- :string]
  (update-persisted-infos! nil {:active false, :state state, :state_change_at :%now}))

(mu/defn update-persisted-info-deactivated! :- :int
  "Deactivate the PersistedInfo with `id` and move it to `state`, returning the number updated."
  [id    :- ms/PositiveInt
   state :- :string]
  (update-persisted-infos! {:id id} {:active false, :state state, :state_change_at :%now}))

(mu/defn update-persisted-infos-for-database! :- :int
  "Deactivate the PersistedInfos of the Database with `database-id` and move them to `state`, returning the
  number updated."
  [database-id :- ::lib.schema.id/database
   state       :- :string]
  (update-persisted-infos! {:database_id database-id} {:active false, :state state, :state_change_at :%now}))

(mu/defn update-persisted-infos-for-cards-invalidated! :- :int
  "Deactivate the active PersistedInfos of the Cards with `card-ids` and move them back to creating, returning
  the number updated."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (update-persisted-infos! {:active true, :card_id (set card-ids)}
                           {:active false, :state "creating", :state_change_at :%now}))

(mu/defn update-persisted-info-reset-to-creating! :- :int
  "Deactivate the PersistedInfo with `id` and move it back to creating, returning the number updated."
  [id :- ms/PositiveInt]
  (update-persisted-infos! {:id id} {:active false, :state "creating", :state_change_at :%now}))

(mu/defn update-deletable-persisted-infos-for-database!
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
