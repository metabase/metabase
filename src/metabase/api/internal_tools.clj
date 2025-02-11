(ns metabase.api.internal-tools
  (:require
   [clojure.java.jdbc :as jdbc]
   [honey.sql :as sql]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc :as driver.sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.events :as events]
   [metabase.models.cell-edit]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment
  metabase.models.cell-edit/keep-me)

(derive ::event :metabase/event)
(derive :table.mutation/cell-update ::event)

(defn- update-cell! [field-id row-pk value]
  (let [{column :name :keys [table_id semantic_type]} (api/check-404 (t2/select-one :model/Field field-id))
        {table :name :keys [db_id schema]} (api/check-404 (t2/select-one :model/Table table_id))
        pks    (t2/select :model/Field :table_id table_id :semantic_type :type/PK)
        driver (driver/the-driver (:engine (t2/select-one :model/Database db_id)))]
    (assert (not= :type/PK semantic_type) "Cannot modify PK")
    (assert (= 1 (count pks)) "Table must have a PK, and it cannot be compound")

    (let [old-value (let [sql (sql/format {:select [(keyword column)]
                                           :from   [(keyword table)]
                                           :where  [:= row-pk (keyword (:name (first pks)))]}
                                          :quoted true
                                          :dialect (sql.qp/quote-style driver))]
                      (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db_id)]
                        (val (ffirst (jdbc/query conn sql)))))]

      (driver.sql-jdbc/update-row-column! driver
                                          db_id
                                          schema
                                          table
                                          (:name (first pks))
                                          row-pk
                                          column
                                          value)

      (t2/insert! :model/CellEdit
                  {:table_id  table_id
                   :field_id  field-id
                   :old_value old-value
                   :new_value value})

      (events/publish-event! :table.mutation/cell-update
                             {:object-id field-id
                              :object    {:pk        row-pk
                                          :value-new value
                                          :value-old old-value}
                              :user-id   api/*current-user-id*}))))

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
