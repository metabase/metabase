(ns metabase.api.internal-tools
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc :as driver.sql-jdbc]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- update-cell! [field-id row-pk value]
  (let [{column :name :keys [table_id semantic_type]} (api/check-404 (t2/select-one :model/Field field-id))
        {table :name :keys [db_id schema]} (api/check-404 (t2/select-one :model/Table table_id))
        pks    (t2/select :model/Field :table_id table_id :semantic_type :type/PK)
        driver (driver/the-driver (:engine (t2/select-one :model/Database db_id)))]
    (assert (not= :type/PK semantic_type) "Cannot modify PK")
    (assert (= 1 (count pks)) "Table must have a PK, and it cannot be compound")

    (driver.sql-jdbc/update-row-column! driver
                                        db_id
                                        schema
                                        table
                                        (:name (first pks))
                                        row-pk
                                        column
                                        value)))

(api.macros/defendpoint :put "/field/:field-id/:row-pk"
  "Update the given value in the underlying table."
  [{:keys [field-id row-pk]} :- [:map
                                 [:field-id ms/PositiveInt]
                                 [:row-pk ms/PositiveInt]]
   {}
   {:keys [value]} :- [:map [:value :any]]]
  (update-cell! field-id row-pk value))

(comment
  (def table (t2/select-one :model/Table :name "PEOPLE"))
  (def field-id (t2/select-one-fn :id [:model/Field :id] :table_id (:id table) :name "NAME"))
  (update-cell! field-id 1 "Dr Celery Celsius")

  (t2/select-fn-vec (juxt :name :database_type) [:model/Field :database_type :name :table_id] :table_id (t2/select-one-pk :model/Table :name "PEOPLE"))
  (u/index-by :database_type (juxt :table_id :name) (t2/select :model/Field))
  (t2/select-one-fn :name :model/Table 219))
