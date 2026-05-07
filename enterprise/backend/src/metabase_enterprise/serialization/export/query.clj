(ns metabase-enterprise.serialization.export.query
  "Reducible queries for the metadata-export pipeline. Each model implements
  `export-query` to produce the reducible row stream, and `export-query-filter`
  to produce a HoneySQL where predicate scoped to a given table alias. Filters
  are reusable across queries — e.g. the field query joins through table and
  database, so it composes the database/table filters too."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private perm-mapping
  "Permission mapping required to include a database/table in the export."
  {:perms/view-data      :unrestricted
   :perms/create-queries :query-builder})

(defmulti export-query
  "Returns a reducible row stream for `model`. `opts` carries caller context
  (e.g. `:user-info`, section flags)."
  {:arglists '([model opts])}
  (fn [model _opts] model))

(defmulti export-query-filter
  "Returns a HoneySQL where predicate that restricts rows of `model` qualified by
  table `alias`. Used to compose `WHERE` and `JOIN ... ON` clauses across the
  database/table/field hierarchy."
  {:arglists '([model alias opts])}
  (fn [model _alias _opts] model))

(defmethod export-query-filter :model/Database
  [_model alias {:keys [user-info]}]
  [:and
   [:= (u/qualified-key alias :is_audit) false]
   [:= (u/qualified-key alias :router_database_id) nil]
   [:in (u/qualified-key alias :id) (perms/visible-database-filter-select user-info perm-mapping)]])

(defmethod export-query-filter :model/Table
  [_model alias {:keys [user-info]}]
  [:and
   [:= (u/qualified-key alias :active) true]
   [:= (u/qualified-key alias :visibility_type) nil]
   [:in (u/qualified-key alias :id) (perms/visible-table-filter-select :id user-info perm-mapping)]])

(defmethod export-query-filter :model/Field
  [_model alias _opts]
  [:and
   [:= (u/qualified-key alias :active) true]
   [:<> (u/qualified-key alias :visibility_type) "sensitive"]])

(defmethod export-query :model/Database
  [model opts]
  (t2/reducible-query {:select [[:db.name :name] [:db.engine :engine]]
                       :from   [[:metabase_database :db]]
                       :where  (export-query-filter model :db opts)}))

(defmethod export-query :model/Table
  [_model opts]
  (t2/reducible-query {:select [[:db.name :db_name]
                                [:table.schema :schema]
                                [:table.name :table_name]
                                [:table.description :description]]
                       :from   [[:metabase_table :table]]
                       :join   [[:metabase_database :db] [:= :table.db_id :db.id]]
                       :where  [:and
                                (export-query-filter :model/Database :db opts)
                                (export-query-filter :model/Table :table opts)]}))

(defmethod export-query :model/Field
  [_model opts]
  (t2/reducible-query
   {:select    [[:db.name :db_name]
                [:db.engine :engine]
                [:table.schema :table_schema]
                [:table.name :table_name]
                [:field.name :field_name]
                [:field.parent_id :parent_id]
                [:field.description :description]
                [:field.base_type :base_type]
                [:field.database_type :database_type]
                [:field.effective_type :effective_type]
                [:field.semantic_type :semantic_type]
                [:field.coercion_strategy :coercion_strategy]
                [:field.nfc_path :nfc_path]
                [:fk_db.name :fk_db_name]
                [:fk_db.engine :fk_db_engine]
                [:fk_table.schema :fk_table_schema]
                [:fk_table.name :fk_table_name]
                [:fk_field.name :fk_field_name]
                [:fk_field.parent_id :fk_parent_id]
                [:fk_field.nfc_path :fk_field_nfc_path]]
    :from      [[:metabase_field :field]]
    :join      [[:metabase_table :table]    [:= :field.table_id :table.id]
                [:metabase_database :db]    [:= :table.db_id :db.id]]
    :left-join [[:metabase_field :fk_field]
                [:and
                 [:= :field.fk_target_field_id :fk_field.id]
                 (export-query-filter :model/Field :fk_field opts)]
                [:metabase_table :fk_table]
                [:and
                 [:= :fk_field.table_id :fk_table.id]
                 (export-query-filter :model/Table :fk_table opts)]
                [:metabase_database :fk_db]
                [:and
                 [:= :fk_table.db_id :fk_db.id]
                 (export-query-filter :model/Database :fk_db opts)]]
    :where     [:and
                (export-query-filter :model/Database :db opts)
                (export-query-filter :model/Table :table opts)
                (export-query-filter :model/Field :field opts)]}))
