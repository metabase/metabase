(ns metabase-enterprise.library-branching.db
  "App DB queries of library branching."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(mr/def ::query
  [:map {::mr/deliberately-open true, :description "a HoneySQL select query"}])

(mr/def ::row
  [:map {::mr/deliberately-open true, :description "a row of a query, column name to value"}])

(mr/def ::ids
  [:sequential {:max 1000} pos-int?])

(mr/def ::entity-ids
  [:sequential {:max 1000} :string])

(mr/def ::table-key
  [:tuple :string [:maybe :string] :string])

(mu/defn rows :- [:sequential ::row]
  "The rows that HoneySQL `query` selects, in the current transaction."
  [query :- ::query]
  (t2/query query))

(mu/defn row-count :- :int
  "The number of rows that HoneySQL `query` selects, in the current transaction, with one statement. `query` has the
  metadata `:allow-subquery`."
  [query :- ::query]
  (:n (t2/query-one {:select [[:%count.* :n]] :from [[query :q]]})))

;;; --------------------------------------------------- Read point ---------------------------------------------------

(defn do-with-read-point
  "Calls `f` with no arguments in a new read-only transaction at REPEATABLE READ isolation, and returns its result:
  every read of `f` on the app DB sees the database as of one moment. Throws when the calling thread holds an open
  transaction, whose isolation cannot change."
  [f]
  (when (mdb/in-transaction?)
    (throw (ex-info "A read point needs a new transaction, and this thread holds an open one." {})))
  (t2/with-connection [^Connection conn]
    (let [isolation  (.getTransactionIsolation conn)
          read-only? (.isReadOnly conn)]
      ;; Both are properties of the next transaction, so they are set before it starts, and restored before the
      ;; pool gets the connection back.
      (.setTransactionIsolation conn Connection/TRANSACTION_REPEATABLE_READ)
      (.setReadOnly conn true)
      (try
        (t2/with-transaction [_ conn]
          (f))
        (finally
          (.setReadOnly conn read-only?)
          (.setTransactionIsolation conn isolation))))))

;;; ---------------------------------------------------- Transaction ------------------------------------------------

(defn do-in-transaction
  "Calls `f` with no arguments in a transaction (a savepoint inside an open one), and returns its result. A throw of
  `f` rolls the transaction back."
  [f]
  (t2/with-transaction [_]
    (f)))

;;; ------------------------------------------------ Reference lookups -----------------------------------------------

(mu/defn fields-by-id :- [:sequential ::row]
  "`{:id :table_id :name :parent_id}` of each field of `ids`."
  [ids :- ::ids]
  (t2/query {:select [:id :table_id :name :parent_id]
             :from   [(warehouse-schema-overlay/field-query {:user-settings? false})]
             :where  [:in :id ids]}))

(mu/defn table-keys-by-id :- [:sequential ::row]
  "`{:id :db :schema :table}` of each table of `ids`: its id, and the database name, schema and name of its natural
  key."
  [ids :- ::ids]
  (t2/query {:select [:t.id [:d.name :db] :t.schema [:t.name :table]]
             :from   [(warehouse-schema-overlay/table-query {:alias :t :user-settings? false})]
             :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where  [:in :t.id ids]}))

(mu/defn entity-ids-by-id :- [:sequential ::row]
  "`{:id :entity_id}` of each row of `ids` of the table of `model`."
  [model :- :keyword
   ids   :- ::ids]
  (t2/query {:select [:id :entity_id]
             :from   [(t2/table-name model)]
             :where  [:in :id ids]}))

(mu/defn column-by-id :- [:sequential ::row]
  "`{:id :v}`: the value of `column` of each row of `ids` of the table of `model`."
  [model  :- :keyword
   column :- :keyword
   ids    :- ::ids]
  (t2/query {:select [:id [column :v]]
             :from   [(t2/table-name model)]
             :where  [:in :id ids]}))

;;; ------------------------------------------------------ Base ------------------------------------------------------

(mr/def ::base-row
  [:map [:commit_id [:maybe :string]] [:digests [:maybe :string]]])

(mu/defn base-row :- [:maybe ::base-row]
  "`{:commit_id :digests}` of the base row, in the current transaction, or nil when there is no base row."
  []
  (t2/query-one {:select [:commit_id :digests]
                 :from   [:library_branching_base]
                 :where  [:= :id 1]}))

(mu/defn compare-and-set-base! :- :int
  "Sets the commit id of the base row to `commit-id` and its digests to `digests`, in one statement, iff its commit id
  is `expected` (nil: null). Returns the number of rows that the statement changed, 1 or 0."
  [expected  :- [:maybe :string]
   commit-id :- :string
   digests   :- :string]
  (first (t2/query {:update :library_branching_base
                    :set    {:commit_id commit-id :digests digests}
                    :where  [:and
                             [:= :id 1]
                             (if expected
                               [:= :commit_id [:auto/param expected]]
                               [:= :commit_id nil])]})))

;;; ---------------------------------------------------- Content -----------------------------------------------------

(mu/defn collections-by-entity-id :- [:sequential ::row]
  "The rows of the collections of `entity-ids`."
  [entity-ids :- ::entity-ids]
  (t2/query {:select [:id :entity_id :name :description :type :namespace :authority_level :location]
             :from   [(t2/table-name :model/Collection)]
             :where  [:in :entity_id entity-ids]}))

(mu/defn cards-by-entity-id :- [:sequential ::row]
  "The cards of `entity-ids`, as instances of `:model/Card` with the columns `columns`."
  [columns    :- [:sequential :keyword]
   entity-ids :- ::entity-ids]
  ;; Named columns also keep the Card model from building a Lib query for each metric to describe it.
  (t2/select (into [:model/Card] columns) :entity_id [:in entity-ids]))

(mu/defn snippets-by-entity-id :- [:sequential ::row]
  "The snippets of `entity-ids`, as instances of `:model/NativeQuerySnippet`."
  [entity-ids :- ::entity-ids]
  (t2/select :model/NativeQuerySnippet :entity_id [:in entity-ids]))

(mu/defn tables-by-key :- [:sequential ::row]
  "`{:id :db :schema :table :display_name :collection_id}` of each table of `table-keys`, natural keys `[database
  schema table]`. `:display_name` and `:collection_id` are the values that users see."
  [table-keys :- [:sequential {:max 100} ::table-key]]
  (if (empty? table-keys)
    []
    (t2/query {:select [:t.id [:d.name :db] :t.schema [:t.name :table] :t.display_name :t.collection_id]
               :from   [(warehouse-schema-overlay/table-query {:alias :t})]
               :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
               :where  (into [:or]
                             (map (fn [[db schema table]]
                                    [:and [:= :d.name db] [:= :t.schema schema] [:= :t.name table]]))
                             table-keys)})))

(mu/defn table-user-settings-by-table-id :- [:sequential ::row]
  "The user settings rows of the tables of `ids`, as instances of `:model/TableUserSettings`."
  [ids :- ::ids]
  (t2/select :model/TableUserSettings :table_id [:in ids]))

(defn- fields-of-tables
  [table-ids]
  (vary-meta {:select [:id]
              :from   [(warehouse-schema-overlay/field-query {:user-settings? false})]
              :where  [:in :table_id table-ids]}
             assoc :allow-subquery true))

(mu/defn field-user-settings-by-table-id :- [:sequential ::row]
  "The user settings rows of the fields of the tables of `ids`, as instances of `:model/FieldUserSettings`."
  [ids :- ::ids]
  (t2/select :model/FieldUserSettings {:where [:in :field_id (fields-of-tables ids)]}))

;;; ------------------------------------------------- Locks and writes -------------------------------------------------

(mu/defn lock-collection :- [:maybe ::row]
  "`{:id :entity_id :name :type :namespace :location :archived :personal_owner_id}` of the collection of `entity-id`,
  after a lock on its row until the current transaction ends; nil when there is none."
  [entity-id :- :string]
  (t2/query-one {:select [:id :entity_id :name :type :namespace :location :archived :personal_owner_id]
                 :from   [(t2/table-name :model/Collection)]
                 :where  [:= :entity_id [:auto/param entity-id]]
                 :for    [:update]}))

(mu/defn collection-by-entity-id :- [:maybe ::row]
  "`{:id :entity_id :type :namespace :location :archived}` of the collection of `entity-id`, or nil."
  [entity-id :- :string]
  (t2/query-one {:select [:id :entity_id :type :namespace :location :archived]
                 :from   [(t2/table-name :model/Collection)]
                 :where  [:= :entity_id [:auto/param entity-id]]}))

(mu/defn collections-by-id :- [:sequential ::row]
  "`{:id :entity_id :type :namespace :location :archived}` of each collection of `ids`."
  [ids :- ::ids]
  (t2/query {:select [:id :entity_id :type :namespace :location :archived]
             :from   [(t2/table-name :model/Collection)]
             :where  [:in :id ids]}))

(mu/defn insert-collection! :- ::row
  "Inserts a collection with the columns `row` through the Collection model, and returns it."
  [row :- ::row]
  (t2/insert-returning-instance! :model/Collection row))

(mu/defn update-collection! :- :int
  "Sets the columns `changes` of the collection `id` through the Collection model; returns the number of rows."
  [id      :- pos-int?
   changes :- ::row]
  (t2/update! :model/Collection id changes))

(mu/defn move-descendant-collections! :- :int
  "Replaces the location prefix `from` with `to` in the location of each collection whose location starts with `from`;
  returns the number of rows."
  [from :- :string
   to   :- :string]
  (t2/query-one {:update (t2/table-name :model/Collection)
                 :set    {:location [:replace :location from to]}
                 :where  [:like :location (str from "%")]}))

(mu/defn select-collection :- [:maybe ::row]
  "The collection `id`, as an instance of `:model/Collection`."
  [id :- pos-int?]
  (t2/select-one :model/Collection id))

(mu/defn lock-card :- [:maybe ::row]
  "`{:id :type :collection_id :archived}` of the card of `entity-id`, after a lock on its row until the current
  transaction ends; nil when there is none."
  [entity-id :- :string]
  (t2/query-one {:select [:id :type :collection_id :archived]
                 :from   [(t2/table-name :model/Card)]
                 :where  [:= :entity_id [:auto/param entity-id]]
                 :for    [:update]}))

(mu/defn insert-card! :- ::row
  "Inserts a card with the columns `row` through the Card model, and returns it."
  [row :- ::row]
  (t2/insert-returning-instance! :model/Card row))

(mu/defn update-card! :- :int
  "Sets the columns `changes` of the card `id` through the Card model; returns the number of rows."
  [id      :- pos-int?
   changes :- ::row]
  (t2/update! :model/Card id changes))

(mu/defn lock-snippet :- [:maybe ::row]
  "`{:id :collection_id :archived}` of the snippet of `entity-id`, after a lock on its row until the current
  transaction ends; nil when there is none."
  [entity-id :- :string]
  (t2/query-one {:select [:id :collection_id :archived]
                 :from   [(t2/table-name :model/NativeQuerySnippet)]
                 :where  [:= :entity_id [:auto/param entity-id]]
                 :for    [:update]}))

(mu/defn insert-snippet! :- ::row
  "Inserts a snippet with the columns `row` through the NativeQuerySnippet model, and returns it."
  [row :- ::row]
  (t2/insert-returning-instance! :model/NativeQuerySnippet row))

(mu/defn update-snippet! :- :int
  "Sets the columns `changes` of the snippet `id` through the NativeQuerySnippet model; returns the number of rows."
  [id      :- pos-int?
   changes :- ::row]
  (t2/update! :model/NativeQuerySnippet id changes))

(mu/defn lock-table-settings :- [:sequential ::row]
  "`{:table_id}` of the user settings row of table `table-id` and `{:field_id}` of the user settings rows of its fields,
  after a lock on each of these rows until the current transaction ends."
  [table-id :- pos-int?]
  (into (vec (t2/query {:select [:table_id]
                        :from   [(t2/table-name :model/TableUserSettings)]
                        :where  [:= :table_id [:auto/param table-id]]
                        :for    [:update]}))
        (t2/query {:select [:field_id]
                   :from   [(t2/table-name :model/FieldUserSettings)]
                   :where  [:in :field_id (fields-of-tables [table-id])]
                   :for    [:update]})))

(mu/defn table-fields :- [:sequential ::row]
  "`{:id :name :parent_id :active}` of each field of table `table-id`, by the values that warehouse sync writes."
  [table-id :- pos-int?]
  (t2/query {:select [:id :name :parent_id :active]
             :from   [(warehouse-schema-overlay/field-query {:user-settings? false})]
             :where  [:= :table_id [:auto/param table-id]]}))

(mu/defn table-row :- [:maybe ::row]
  "The row of table `table-id` as warehouse sync writes it, with no user value."
  [table-id :- pos-int?]
  (t2/query-one {:select [:*]
                 :from   [(warehouse-schema-overlay/table-query {:user-settings? false})]
                 :where  [:= :id [:auto/param table-id]]}))

(mu/defn table-settings-exist? :- :boolean
  "True iff table `table-id` has a user settings row."
  [table-id :- pos-int?]
  (t2/exists? :model/TableUserSettings :table_id table-id))

(mu/defn insert-table-settings! :- :any
  "Inserts the user settings row `row` of a table through the TableUserSettings model."
  [row :- ::row]
  (t2/insert! :model/TableUserSettings row))

(mu/defn update-table-settings! :- :int
  "Sets the columns `changes` of the user settings row of table `table-id` through the TableUserSettings model;
  returns the number of rows."
  [table-id :- pos-int?
   changes  :- ::row]
  (t2/update! :model/TableUserSettings table-id changes))

(mu/defn field-settings-exist? :- :boolean
  "True iff field `field-id` has a user settings row."
  [field-id :- pos-int?]
  (t2/exists? :model/FieldUserSettings :field_id field-id))

(mu/defn insert-field-settings! :- :any
  "Inserts the user settings row `row` of a field through the FieldUserSettings model."
  [row :- ::row]
  (t2/insert! :model/FieldUserSettings row))

(mu/defn update-field-settings! :- :int
  "Sets the columns `changes` of the user settings row of field `field-id` through the FieldUserSettings model;
  returns the number of rows."
  [field-id :- pos-int?
   changes  :- ::row]
  (t2/update! :model/FieldUserSettings field-id changes))

;;; ----------------------------------------------------- Tasks ------------------------------------------------------

(mr/def ::task-row
  [:map {::mr/deliberately-open true, :description "a row of library_branching_task"}
   [:id pos-int?]
   [:task_type :string]
   [:status :string]])

(mr/def ::statuses
  [:set {:min 1} :string])

(def ^:private task-columns
  [:id :task_type :status :initiated_by :progress :started_at :last_heartbeat_at :ended_at :outcome :error_message])

(mu/defn insert-task! :- pos-int?
  "Inserts the task row `row` and returns its id."
  [row :- ::row]
  (first (t2/insert-returning-pks! :library_branching_task row)))

(mu/defn task-row :- [:maybe ::task-row]
  "The task row `id`, or nil."
  [id :- pos-int?]
  (t2/query-one {:select task-columns
                 :from   [:library_branching_task]
                 :where  [:= :id [:auto/param id]]}))

(mu/defn lock-task-row :- [:maybe ::task-row]
  "The task row `id`, after a lock on it until the current transaction ends, or nil."
  [id :- pos-int?]
  (t2/query-one {:select task-columns
                 :from   [:library_branching_task]
                 :where  [:= :id [:auto/param id]]
                 :for    [:update]}))

(mu/defn newest-task-row :- [:maybe ::task-row]
  "The newest task row, or nil when there is none."
  []
  (t2/query-one {:select   task-columns
                 :from     [:library_branching_task]
                 :order-by [[:started_at :desc] [:id :desc]]
                 :limit    1}))

(mu/defn newest-live-task-row :- [:maybe ::task-row]
  "The newest task row with a status of `open` and a heartbeat after `cutoff`, or nil."
  [open   :- ::statuses
   cutoff :- ms/TemporalInstant]
  (t2/query-one {:select   task-columns
                 :from     [:library_branching_task]
                 :where    [:and [:in :status open] [:> :last_heartbeat_at [:auto/param cutoff]]]
                 :order-by [[:started_at :desc] [:id :desc]]
                 :limit    1}))

(mu/defn update-task-row! :- :int
  "Sets the columns `changes` of task row `id` iff its status is in `from`. Returns the number of rows changed, 1 or
  0."
  [id      :- pos-int?
   from    :- ::statuses
   changes :- ::row]
  (first (t2/query {:update :library_branching_task
                    :set    changes
                    :where  [:and [:= :id [:auto/param id]] [:in :status from]]})))

(mu/defn end-stale-task-rows! :- [:sequential pos-int?]
  "Sets the columns `changes` of each task row with a status of `open` and a heartbeat before `cutoff`. Returns the ids
  of the rows changed."
  [open    :- ::statuses
   cutoff  :- ms/TemporalInstant
   changes :- ::row]
  (let [stale [:and [:in :status open] [:< :last_heartbeat_at [:auto/param cutoff]]]]
    ;; One update per row, each with the condition again: a row that a heartbeat made fresh after the select stays
    ;; open, and is not in the result.
    (into []
          (filter (fn [id]
                    (= 1 (first (t2/query {:update :library_branching_task
                                           :set    changes
                                           :where  [:and stale [:= :id [:auto/param id]]]})))))
          (map :id (t2/query {:select [:id] :from [:library_branching_task] :where stale})))))

(mu/defn users-by-id :- [:sequential ::row]
  "`{:id :first_name :last_name :email}` of each user of `ids`."
  [ids :- ::ids]
  (if (empty? ids)
    []
    (t2/query {:select [:id :first_name :last_name :email]
               :from   [(t2/table-name :model/User)]
               :where  [:in :id ids]})))
