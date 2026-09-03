(ns metabase.warehouses-rest.db
  "Application database queries for the warehouses REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [toucan2.core :as t2]))

(defn active-visible-tables-for-databases
  "The active, visible Tables of the Databases with `database-ids`, in schema then display name order."
  [database-ids]
  (t2/select :model/Table
             :active          true
             :db_id           [:in database-ids]
             :visibility_type nil
             {:order-by [[:%lower.schema :asc]
                         [:%lower.display_name :asc]]}))

(defn active-visible-schemas-for-databases
  "The distinct Database id and schema of the active, visible Tables of the Databases with `database-ids`."
  [database-ids]
  (t2/query {:select-distinct [:db_id :schema]
             :from            [(t2/table-name :model/Table)]
             :where           [:and
                               [:in :db_id database-ids]
                               [:= :active true]
                               [:= :visibility_type nil]]}))

(defn database-engines
  "The id and engine of every Database."
  []
  (t2/select [:model/Database :id :engine]))

(defn source-query-cards-reducible
  "A reducible of the Cards, with their moderation status, matching the Honey SQL `where` clause, in
  case-insensitive name order."
  [where]
  (t2/reducible-query {:select   [:name :description :database_id :dataset_query :id :collection_id
                                  :result_metadata :type :source_card_id :card_schema
                                  [^:allow-subquery {:select   [:status]
                                                     :from     [:moderation_review]
                                                     :where    [:and
                                                                [:= :moderated_item_type "card"]
                                                                [:= :moderated_item_id :report_card.id]
                                                                [:= :most_recent true]]
                                                     :order-by [[:id :desc]]
                                                     :limit    1}
                                   :moderated_status]]
                       :from     [:report_card]
                       :where    where
                       :order-by [[:%lower.name :asc]]}))

(defn databases-where
  "The Databases matching the Honey SQL `where` clause, in name then engine order."
  [where]
  (t2/select :model/Database {:order-by [:%lower.name :%lower.engine]
                              :where where}))

(defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id]
  (t2/exists? :model/Database :id database-id))

(defn non-destination-database-exists?
  "Whether a Database with `database-id` that is not a routing destination exists."
  [database-id]
  (t2/exists? :model/Database :id database-id :router_database_id nil))

(defn destination-database-exists-for-router?
  "Whether the Database with `database-id` has routing destinations."
  [database-id]
  (t2/exists? :model/Database :router_database_id database-id))

(defn autocomplete-tables
  "Up to `limit` id, Database id, schema, and name rows of the active, visible Tables of the Database with
  `database-id` whose lower-cased name matches the SQL LIKE `like-pattern`, in name order."
  [database-id like-pattern limit]
  (t2/select [:model/Table :id :db_id :schema :name]
             {:where    [:and [:= :db_id database-id]
                         [:= :active true]
                         [:like :%lower.name like-pattern]
                         [:= :visibility_type nil]]
              :order-by [[:%lower.name :asc]]
              :limit    limit}))

(defn autocomplete-cards
  "Up to 50 unarchived Cards of the Database with `database-id`, with their Collection name, also matching the Honey
  SQL `dashboard-clause` and `search-clause`, models first then newest first."
  [database-id dashboard-clause search-clause]
  (t2/select [:model/Card :id :type :database_id :name :collection_id
              [:collection.name :collection_name] :card_schema]
             {:where    [:and
                         [:= :report_card.database_id database-id]
                         [:= :report_card.archived false]
                         dashboard-clause
                         search-clause]
              :left-join [[:collection :collection] [:= :collection.id :report_card.collection_id]]
              ;; prioritize models. This relies of `model` coming before `question` alphabetically, and Tamas pointed
              ;; out this is a little brittle. He's right -- once we put v2 Metrics in then we can replace this with a
              ;; fancy `CASE` expression or something so we can sort things exactly how we like.
              :order-by [[:type :asc]
                         [:report_card.id :desc]] ; sort by most recently created after sorting by type
              :limit    50}))

(defn autocomplete-fields
  "Up to `limit` name, type, id, and Table of the active, non-sensitive Fields of active Tables of the Database with
  `database-id` whose lower-cased name matches the SQL LIKE `like-pattern`, in field then table name order."
  [database-id like-pattern limit]
  ;; NOTE: measuring showed that this query performance is improved ~4x when adding trgm index in pgsql and ~10x when
  ;; adding a index on `lower(metabase_field.name)` for ordering (trgm index having on impact on queries with index).
  ;; Pgsql now has an index on that (see migration `v49.2023-01-24T12:00:00`) as other dbms do not support indexes on
  ;; expressions.
  (t2/select [:model/Field :name :base_type :semantic_type :id :table_id [:table.name :table_name]]
             :metabase_field.active          true
             :%lower.metabase_field/name     [:like like-pattern]
             :metabase_field.visibility_type [:not-in ["sensitive" "retired"]]
             :table.db_id                    database-id
             {:order-by   [[[:lower :metabase_field.name] :asc]
                           [[:lower :table.name] :asc]]
              ;; checking for table.active in join makes query faster when there are a lot of inactive tables
              :inner-join [[:metabase_table :table] [:and :table.active
                                                     [:= :table.id :metabase_field.table_id]]]
              :limit      limit}))

(defn table-ids-for-database
  "The ids of the Tables of the Database with `database-id`."
  [database-id]
  (t2/select-fn-set :id :model/Table, :db_id database-id))

(defn non-sensitive-fields-for-tables
  "The id, name, display name, Table id, and types of the non-sensitive Fields of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Field :id :name :display_name :table_id :base_type :semantic_type]
             :table_id        [:in table-ids]
             :visibility_type [:not-in ["sensitive" "retired"]]))

(defn insert-database!
  "Insert the Database `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Database row))

(defn sample-database
  "The sample Database, or nil."
  []
  (t2/select-one :model/Database :is_sample true))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn update-database!
  "Apply `changes` to the Database with `database-id`."
  [database-id changes]
  (t2/update! :model/Database database-id changes))

(defn delete-destination-databases!
  "Delete the routing destination Databases of the Database with `router-database-id`."
  [router-database-id]
  (t2/delete! :model/Database :router_database_id router-database-id))

(defn delete-database!
  "Delete the Database with `database-id`."
  [database-id]
  (t2/delete! :model/Database :id database-id))

(defn mark-tables-sync-complete!
  "Mark the initial sync of the Tables with `table-ids` complete."
  [table-ids]
  (t2/update! :model/Table {:id [:in table-ids]} {:initial_sync_status "complete"}))

(defn delete-field-values-for-database!
  "Delete the FieldValues of every Field of the Database with `database-id`."
  [database-id]
  (t2/query-one {:delete-from :metabase_fieldvalues
                 :where      [:in :field_id
                              ^:allow-subquery {:select     [:f.id]
                                                :from       [[:metabase_field :f]]
                                                :right-join [[:metabase_table :t] [:= :f.table_id :t.id]]
                                                :where      [:= :t.db_id database-id]}]}))

(defn active-tables-for-database
  "The active Tables of the Database with `database-id`."
  [database-id]
  (t2/select :model/Table :db_id database-id :active true))

(defn active-table-schemas
  "The schemas of the active Tables of the Database with `database-id` also selected by the Honey SQL `query`."
  [database-id query]
  (t2/select-fn-set :schema :model/Table :db_id database-id :active true query))

(defn active-tables-in-schema
  "The active Tables in `schema` of the Database with `database-id`, in display name order."
  [database-id schema]
  (t2/select :model/Table
             :db_id database-id
             :schema schema
             :active true
             {:order-by [[:display_name :asc]]}))

(defn active-visible-tables-in-schema
  "The active, visible Tables in `schema` of the Database with `database-id`, in display name order."
  [database-id schema]
  (t2/select :model/Table
             :db_id database-id
             :schema schema
             :active true
             :visibility_type nil
             {:order-by [[:display_name :asc]]}))

(defn collection-ids-named
  "The ids of the Collections named `collection-name`, or nil."
  [collection-name]
  (t2/select-pks-set :model/Collection :name collection-name))
