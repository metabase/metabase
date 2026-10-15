(ns metabase-enterprise.library-branching.db
  "App DB queries of library branching."
  (:require
   [clojure.string :as str]
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

(defn- touch-table
  [table]
  (t2/query {:select [[1 :one]] :from [table] :limit 1}))

(defn do-with-read-point
  "Calls `f` with no arguments in a new read-only transaction at REPEATABLE READ isolation, and returns its result:
  every read of `f` of the table of a model of `models` sees the database as of one moment. Throws when the calling
  thread holds an open transaction, whose isolation cannot change."
  [models f]
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
          ;; On H2 the snapshot of a table starts at the first read of that table in the transaction, not at the first
          ;; read of the transaction. A read of each table before `f` puts every table at one moment.
          (run! touch-table (into (sorted-set) (map t2/table-name) models))
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

(defn do-in-locking-transaction
  "Calls `f` with no arguments in a new transaction at READ COMMITTED isolation, and returns its result; inside an
  open transaction, in a savepoint of it. A throw of `f` rolls the transaction back. After `f` locks a row, each read
  of it sees its last committed content."
  [f]
  (if (mdb/in-transaction?)
    (do-in-transaction f)
    (t2/with-connection [^Connection conn]
      (let [isolation (.getTransactionIsolation conn)]
        ;; At REPEATABLE READ (the default of MySQL and MariaDB) a plain read after a lock reads the snapshot of the
        ;; first read of the transaction, which can predate a commit to a row that the transaction locks later. The app
        ;; DB data source opens its connections at READ COMMITTED; a connection that a caller changed is set again.
        (.setTransactionIsolation conn Connection/TRANSACTION_READ_COMMITTED)
        (try
          (t2/with-transaction [_ conn]
            (f))
          (finally
            (.setTransactionIsolation conn isolation)))))))

;;; ------------------------------------------------ Reference lookups -----------------------------------------------

(mu/defn fields-by-id :- [:sequential ::row]
  "`{:id :table_id :name :parent_id}` of each field of `ids`."
  [ids :- ::ids]
  (t2/query {:select [:id :table_id :name :parent_id]
             :from   [(warehouse-schema-overlay/field-query {:user-settings? false})]
             :where  [:in :id ids]}))

(def ^:private archive-suffix
  ;; Warehouse sync appends it to the name of a table that it archives.
  #"__mbarchiv__\d+\z")

(defn table-key
  "The natural key `[database schema table]` of the table row `{:db :schema :table :archived_at}`. For a table that
  warehouse sync archived, `table` is the name before the archive."
  [{:keys [db schema table archived_at]}]
  [db schema (if archived_at (str/replace table archive-suffix "") table)])

(defn table-named
  "HoneySQL: the table row whose name is in `name-column` and whose archive time is in `archived-column` has the
  natural key name `table` ([[table-key]]). It also holds for some rows of other names."
  [name-column archived-column table]
  ;; In a LIKE pattern `_` and `%` of `table` match more names than the original name: [[table-key]] filters them.
  [:or
   [:= name-column table]
   [:and [:not= archived-column nil] [:like name-column (str table "__mbarchiv__%")]]])

(defn- with-key-name
  "`row` with `:table` set to the name of its [[table-key]], and no `:archived_at`."
  [row]
  (-> row
      (assoc :table (peek (table-key row)))
      (dissoc :archived_at)))

(mu/defn table-keys-by-id :- [:sequential ::row]
  "`{:id :db :schema :table}` of each table of `ids`: its id, and the database name, schema and name of its natural
  key ([[table-key]])."
  [ids :- ::ids]
  (mapv with-key-name
        (t2/query {:select [:t.id [:d.name :db] :t.schema [:t.name :table] :t.archived_at]
                   :from   [(warehouse-schema-overlay/table-query {:alias :t :user-settings? false})]
                   :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
                   :where  [:in :t.id ids]})))

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
  [:map [:commit_id [:maybe :string]] [:digests [:maybe :string]] [:url [:maybe :string]]])

(mu/defn base-row :- [:maybe ::base-row]
  "`{:commit_id :digests :url}` of the base row, in the current transaction, or nil when there is no base row."
  []
  (t2/query-one {:select [:commit_id :digests :url]
                 :from   [:library_branching_base]
                 :where  [:= :id 1]}))

(defn- url-is
  "The condition that the URL of the base row is `url` (nil: null)."
  [url]
  (if url
    [:= :url [:auto/param url]]
    [:= :url nil]))

(defn- url-is-not
  "The condition that the URL of the base row is not `url` (nil: null), where a null URL differs from every URL."
  [url]
  (if url
    [:or [:= :url nil] [:<> :url [:auto/param url]]]
    [:<> :url nil]))

(mu/defn compare-and-set-base! :- :int
  "Sets the commit id of the base row to `commit-id`, its digests to `digests` and its URL to `url`, in one statement,
  iff the base of `url` is `expected`. The base of `url` is the commit id of the row when the row holds `url`, else
  nil: an instance of another repository has no base. Returns the number of rows that the statement changed, 1 or 0."
  [url       :- [:maybe :string]
   expected  :- [:maybe :string]
   commit-id :- :string
   digests   :- :string]
  (first (t2/query {:update :library_branching_base
                    :set    {:commit_id commit-id :digests digests :url url}
                    :where  [:and
                             [:= :id 1]
                             (if expected
                               [:and (url-is url) [:= :commit_id [:auto/param expected]]]
                               [:or [:= :commit_id nil] (url-is-not url)])]})))

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

(defn- key-row
  "The row of several table rows with one natural key: the published one, then the one that warehouse sync did not
  archive, then the newest."
  [rows]
  (first (sort-by (juxt (comp not true? :is_published) (comp some? :archived_at) (comp - :id)) rows)))

(mu/defn tables-by-key :- [:sequential ::row]
  "`{:id :db :schema :table :display_name :collection_id}` of each table of `table-keys`, natural keys `[database
  schema table]` ([[table-key]]), at most one per key. `:display_name` and `:collection_id` are the values that users
  see. Of a table that warehouse sync archived and a later table with its name, the row is the published one, else
  the later one."
  [table-keys :- [:sequential {:max 100} ::table-key]]
  (if (empty? table-keys)
    []
    (->> (t2/query {:select [:t.id [:d.name :db] :t.schema [:t.name :table] :t.archived_at :t.display_name
                             :t.collection_id :t.is_published]
                    :from   [(warehouse-schema-overlay/table-query {:alias :t})]
                    :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
                    :where  (into [:or]
                                  (map (fn [[db schema table]]
                                         [:and [:= :d.name db] [:= :t.schema schema] (table-named :t.name :t.archived_at table)]))
                                  table-keys)})
         ;; The name condition, and a case-insensitive collation, also match rows of other keys.
         (filter (comp (set table-keys) table-key))
         (group-by table-key)
         vals
         (mapv (comp #(dissoc % :is_published) with-key-name key-row)))))

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

;;; ----------------------------------------------------- Users ------------------------------------------------------

(mu/defn cards-mentioning :- [:sequential ::row]
  "The cards not in the trash whose stored query text holds the text of `id`, as instances of `:model/Card`: every card
  whose query refers to the row `id`, and maybe others."
  [id :- pos-int?]
  (t2/select :model/Card {:where [:and [:= :archived false] [:like :dataset_query (str "%" id "%")]]}))

(mu/defn dashboards-showing :- [:sequential ::row]
  "`{:entity_id :name}` of each dashboard not in the trash that has a card of the card `card-id`."
  [card-id :- pos-int?]
  (t2/query {:select-distinct [:d.entity_id :d.name]
             :from            [[(t2/table-name :model/Dashboard) :d]]
             :join            [[(t2/table-name :model/DashboardCard) :dc] [:= :dc.dashboard_id :d.id]]
             :where           [:and [:= :dc.card_id [:auto/param card-id]] [:= :d.archived false]]}))

(defn- values-source-users
  "The ParameterCard rows that `card-condition` (HoneySQL on `pc.card_id`) selects, each with `:user_collection_id`:
  the collection of the card or dashboard whose parameter takes its values from the card."
  [card-condition]
  {:select    [:pc.id :pc.card_id :pc.parameterized_object_type :pc.parameterized_object_id :pc.parameter_id
               :pc.created_at :pc.updated_at
               [[:coalesce :c.collection_id :d.collection_id] :user_collection_id]]
   :from      [[(t2/table-name :model/ParameterCard) :pc]]
   :left-join [[(t2/table-name :model/Card) :c]
               [:and [:= :pc.parameterized_object_type "card"] [:= :c.id :pc.parameterized_object_id]]
               [(t2/table-name :model/Dashboard) :d]
               [:and [:= :pc.parameterized_object_type "dashboard"] [:= :d.id :pc.parameterized_object_id]]]
   :where     card-condition
   :order-by  [:pc.id]})

(mu/defn values-source-users-of-card :- [:sequential ::row]
  "The ParameterCard rows of the parameters that take their values from the card `card-id`, each with
  `:user_collection_id`, the collection of the card or dashboard of the parameter."
  [card-id :- pos-int?]
  (t2/query (values-source-users [:= :pc.card_id [:auto/param card-id]])))

(mu/defn values-source-users-in-subtree :- [:sequential ::row]
  "The ParameterCard rows of the parameters that take their values from a card in the collection `collection-id` or
  in a collection whose location starts with `location`, each with `:user_collection_id`, the collection of the card
  or dashboard of the parameter."
  [collection-id :- pos-int?
   location      :- :string]
  (let [collections ^:allow-subquery {:select [:id]
                                      :from   [(t2/table-name :model/Collection)]
                                      :where  [:or
                                               [:= :id [:auto/param collection-id]]
                                               [:like :location (str location "%")]]}
        cards       ^:allow-subquery {:select [:id]
                                      :from   [(t2/table-name :model/Card)]
                                      :where  [:in :collection_id collections]}]
    (t2/query (values-source-users [:in :pc.card_id cards]))))

(mu/defn delete-parameter-cards! :- :int
  "Deletes the ParameterCard rows of `ids`, with no model hook; returns the number of rows."
  [ids :- ::ids]
  (if (empty? ids)
    0
    (first (t2/query {:delete-from (t2/table-name :model/ParameterCard)
                      :where       [:in :id ids]}))))

(mu/defn insert-parameter-cards! :- :any
  "Inserts the ParameterCard rows `rows`, ids included, with no model hook."
  [rows :- [:sequential {:max 1000} ::row]]
  (when (seq rows)
    (t2/query {:insert-into (t2/table-name :model/ParameterCard)
               :values      rows})))

(mu/defn row-id-by-entity-id :- [:maybe pos-int?]
  "The id of the row of the table of `model` whose entity id is `entity-id`, or nil."
  [model     :- :keyword
   entity-id :- :string]
  (:id (t2/query-one {:select [:id]
                      :from   [(t2/table-name model)]
                      :where  [:= :entity_id [:auto/param entity-id]]})))

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

(mu/defn delete-task-rows-before! :- :int
  "Deletes each task row with a status of `statuses` that started before `cutoff`. Returns the number of rows deleted."
  [statuses :- ::statuses
   cutoff   :- ms/TemporalInstant]
  (first (t2/query {:delete-from :library_branching_task
                    :where       [:and [:in :status statuses] [:< :started_at [:auto/param cutoff]]]})))

(mu/defn users-by-id :- [:sequential ::row]
  "`{:id :first_name :last_name :email}` of each user of `ids`."
  [ids :- ::ids]
  (if (empty? ids)
    []
    (t2/query {:select [:id :first_name :last_name :email]
               :from   [(t2/table-name :model/User)]
               :where  [:in :id ids]})))

(mu/defn glossary-terms-by-entity-id :- [:sequential ::row]
  "`{:entity_id :term :definition}` of the glossary terms of `entity-ids`."
  [entity-ids :- ::entity-ids]
  (t2/query {:select [:entity_id :term :definition]
             :from   [(t2/table-name :model/Glossary)]
             :where  [:in :entity_id entity-ids]}))

(mu/defn lock-glossary-term :- [:maybe ::row]
  "`{:id :entity_id :term :definition}` of the glossary term of `entity-id`, after a lock on its row until the current
  transaction ends; nil when there is none."
  [entity-id :- :string]
  (t2/query-one {:select [:id :entity_id :term :definition]
                 :from   [(t2/table-name :model/Glossary)]
                 :where  [:= :entity_id [:auto/param entity-id]]
                 :for    [:update]}))

(mu/defn glossary-term-by-term :- [:maybe ::row]
  "`{:id :entity_id}` of the glossary term whose term equals `term` by the comparison of the app DB, which its unique
  key on the term also uses; nil when there is none."
  [term :- :string]
  (t2/query-one {:select [:id :entity_id]
                 :from   [(t2/table-name :model/Glossary)]
                 :where  [:= :term [:auto/param term]]}))

(mu/defn insert-glossary-term! :- ::row
  "Inserts a glossary term with the columns `row` through the Glossary model, and returns it."
  [row :- ::row]
  (t2/insert-returning-instance! :model/Glossary row))

(mu/defn update-glossary-term! :- :int
  "Sets the columns `changes` of the glossary term `id` through the Glossary model; returns the number of rows."
  [id      :- pos-int?
   changes :- ::row]
  (t2/update! :model/Glossary id changes))

(mu/defn delete-glossary-term! :- :int
  "Deletes the glossary term `id`; returns the number of rows."
  [id :- pos-int?]
  (t2/delete! :model/Glossary :id id))
;;; ------------------------------------------------- Table items -------------------------------------------------
;; Segments and measures: rows that live on a warehouse table.

(mr/def ::table-item-model
  [:enum :model/Segment :model/Measure])

(mu/defn tables-by-id :- [:sequential ::row]
  "`{:id :is_published :collection_id}` of each table of `ids`, with the values that users see."
  [ids :- ::ids]
  (t2/query {:select [:t.id :t.is_published :t.collection_id]
             :from   [(warehouse-schema-overlay/table-query {:alias :t})]
             :where  [:in :t.id ids]}))

(mu/defn table-items-by-entity-id :- [:sequential ::row]
  "The rows of `model` of `entity-ids`, as instances of `model`."
  [model      :- ::table-item-model
   entity-ids :- ::entity-ids]
  (t2/select model :entity_id [:in entity-ids]))

(mu/defn lock-table-item :- [:maybe ::row]
  "`{:id :table_id :archived}` of the row of `model` of `entity-id`, after a lock on it until the current transaction
  ends; nil when there is none."
  [model     :- ::table-item-model
   entity-id :- :string]
  (t2/query-one {:select [:id :table_id :archived]
                 :from   [(t2/table-name model)]
                 :where  [:= :entity_id [:auto/param entity-id]]
                 :for    [:update]}))

(mu/defn insert-table-item! :- ::row
  "Inserts a row of `model` with the columns `row` through the model, and returns it."
  [model :- ::table-item-model
   row   :- ::row]
  (t2/insert-returning-instance! model row))

(mu/defn update-table-item! :- :int
  "Sets the columns `changes` of the row `id` of `model` through the model; returns the number of rows."
  [model   :- ::table-item-model
   id      :- pos-int?
   changes :- ::row]
  (t2/update! model id changes))

(mu/defn archive-table-items! :- :int
  "Archives the rows of `model` of `entity-ids` through the model; returns the number of rows."
  [model      :- ::table-item-model
   entity-ids :- ::entity-ids]
  (if (empty? entity-ids)
    0
    (t2/update! model {:entity_id [:in entity-ids]} {:archived true})))

;;; ---------------------------------------------------- Dashboards --------------------------------------------------

(def ^:private dashboard-columns
  [:id :entity_id :name :collection_id :archived :description :caveats :points_of_interest :collection_position
   :position :width :auto_apply_filters :show_in_getting_started :parameters])

(mu/defn dashboards-by-entity-id :- [:sequential ::row]
  "The dashboards of `entity-ids`, as instances of `:model/Dashboard` with their content columns."
  [entity-ids :- ::entity-ids]
  (t2/select (into [:model/Dashboard] dashboard-columns) :entity_id [:in entity-ids]))

(mu/defn tabs-of-dashboards :- [:sequential ::row]
  "`{:id :entity_id :dashboard_id :name}` of each tab of the dashboards `ids`, by dashboard, then position, then id."
  [ids :- ::ids]
  (t2/query {:select   [:id :entity_id :dashboard_id :name]
             :from     [(t2/table-name :model/DashboardTab)]
             :where    [:in :dashboard_id ids]
             :order-by [[:dashboard_id :asc] [:position :asc] [:id :asc]]}))

(mu/defn dashcards-of-dashboards :- [:sequential ::row]
  "The dashboard cards of the dashboards `ids`, as instances of `:model/DashboardCard` with their content columns."
  [ids :- ::ids]
  (t2/select [:model/DashboardCard :id :entity_id :dashboard_id :card_id :action_id :dashboard_tab_id :row :col
              :size_x :size_y :parameter_mappings :visualization_settings :inline_parameters]
             :dashboard_id [:in ids]
             {:order-by [[:id :asc]]}))

(mu/defn series-of-dashcards :- [:sequential ::row]
  "`{:dashboardcard_id :card_id}` of each series of the dashboard cards `ids`, by dashboard card, then position, then
  id."
  [ids :- ::ids]
  (t2/query {:select   [:dashboardcard_id :card_id]
             :from     [(t2/table-name :model/DashboardCardSeries)]
             :where    [:in :dashboardcard_id ids]
             :order-by [[:dashboardcard_id :asc] [:position :asc] [:id :asc]]}))

(mu/defn lock-dashboard :- [:maybe ::row]
  "`{:id :collection_id :archived}` of the dashboard of `entity-id`, after a lock on its row, the rows of its tabs, its
  dashboard cards and their series until the current transaction ends; nil when there is none."
  [entity-id :- :string]
  (when-let [row (t2/query-one {:select [:id :collection_id :archived]
                                :from   [(t2/table-name :model/Dashboard)]
                                :where  [:= :entity_id [:auto/param entity-id]]
                                :for    [:update]})]
    (let [dashcards ^:allow-subquery {:select [:id]
                                      :from   [(t2/table-name :model/DashboardCard)]
                                      :where  [:= :dashboard_id [:auto/param (:id row)]]}]
      (t2/query {:select [:id]
                 :from   [(t2/table-name :model/DashboardTab)]
                 :where  [:= :dashboard_id [:auto/param (:id row)]]
                 :for    [:update]})
      (t2/query (assoc dashcards :for [:update]))
      (t2/query {:select [:id]
                 :from   [(t2/table-name :model/DashboardCardSeries)]
                 :where  [:in :dashboardcard_id dashcards]
                 :for    [:update]}))
    row))

(mu/defn insert-dashboard! :- ::row
  "Inserts a dashboard with the columns `row` through the Dashboard model, and returns it."
  [row :- ::row]
  (t2/insert-returning-instance! :model/Dashboard row))

(mu/defn update-dashboard! :- :int
  "Sets the columns `changes` of the dashboard `id` through the Dashboard model; returns the number of rows."
  [id      :- pos-int?
   changes :- ::row]
  (t2/update! :model/Dashboard id changes))

(mu/defn insert-dashboard-tab! :- pos-int?
  "Inserts a dashboard tab with the columns `row` through the DashboardTab model, and returns its id."
  [row :- ::row]
  (t2/insert-returning-pk! :model/DashboardTab row))

(mu/defn update-dashboard-tab! :- :int
  "Sets the columns `changes` of the dashboard tab `id` through the DashboardTab model; returns the number of rows."
  [id      :- pos-int?
   changes :- ::row]
  (t2/update! :model/DashboardTab id changes))

(mu/defn insert-dashcard! :- pos-int?
  "Inserts a dashboard card with the columns `row` through the DashboardCard model, and returns its id."
  [row :- ::row]
  (t2/insert-returning-pk! :model/DashboardCard row))

(mu/defn update-dashcard! :- :int
  "Sets the columns `changes` of the dashboard card `id` through the DashboardCard model; returns the number of rows."
  [id      :- pos-int?
   changes :- ::row]
  (t2/update! :model/DashboardCard id changes))

(mu/defn values-source-users-of-dashboard-questions :- [:sequential ::row]
  "The ParameterCard rows of the parameters that take their values from a question of the dashboard `dashboard-id`,
  each with `:user_collection_id`, the collection of the card or dashboard of the parameter."
  [dashboard-id :- pos-int?]
  (let [cards ^:allow-subquery {:select [:id]
                                :from   [(t2/table-name :model/Card)]
                                :where  [:= :dashboard_id [:auto/param dashboard-id]]}]
    (t2/query (values-source-users [:in :pc.card_id cards]))))
