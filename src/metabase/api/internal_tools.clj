(ns metabase.api.internal-tools
  (:require
   [clojure.java.jdbc :as jdbc]
   [honey.sql :as sql]
   ^{:clj-kondo/ignore [:metabase/ns-module-checker]}
   [metabase.actions.http-action :as http-action]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc :as driver.sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.events :as events]
   [metabase.models.cell-edit]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment
  metabase.models.cell-edit/keep-me)

(derive ::event :metabase/event)
(derive :event/table-mutation-cell-update ::event)
(derive :event/table-mutation-row-insert ::event)
(derive :event/table-mutation-row-delete ::event)

(defn- parse-value [base-type v]
  ;; TODO this logic is duplicated with metabase.query-processor.middleware.auto-parse-filter-values
  ;; factor out or decide what to do
  ;; thought: need to parse dates and stuff but integers could maybe be passed as json numbers to the server
  (condp #(isa? %2 %1) base-type
    :type/BigInteger (bigint v)
    :type/Integer    (parse-long v)
    :type/Decimal    (bigdec v)
    :type/Float      (parse-double v)
    :type/Boolean    (parse-boolean v)
    v))

(defn- update-cell! [field-id row-pk value]
  (let [{column :name :keys [table_id semantic_type base_type]}
        (api/check-404 (t2/select-one :model/Field field-id))
        {table :name :keys [db_id schema]} (api/check-404 (t2/select-one :model/Table table_id))
        pks    (t2/select :model/Field :table_id table_id :semantic_type :type/PK)
        driver (driver/the-driver (:engine (t2/select-one :model/Database db_id)))]
    (assert (not= :type/PK semantic_type) "Cannot modify PK")
    (assert (= 1 (count pks)) "Table must have a PK and it cannot be compound")

    (let [old-row   (let [sql (sql/format {:select [:*]
                                           :from   [(keyword table)]
                                           :where  [:= row-pk (keyword (:name (first pks)))]}
                                          :quoted true
                                          :dialect (sql.qp/quote-style driver))]
                      (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db_id)]
                        (first (jdbc/query conn sql))))
          old-value (let [sql (sql/format {:select [(keyword column)]
                                           :from   [(keyword table)]
                                           :where  [:= row-pk (keyword (:name (first pks)))]}
                                          :quoted true
                                          :dialect (sql.qp/quote-style driver))]
                      (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db_id)]
                        (val (ffirst (jdbc/query conn sql)))))
          new-value (parse-value base_type value)]

      (driver.sql-jdbc/update-row-column! driver
                                          db_id
                                          schema
                                          table
                                          (:name (first pks))
                                          row-pk
                                          column
                                          new-value)

      (t2/insert! :model/TableEdit
                  {:table_id  table_id
                   :pk       row-pk
                   :type      "edit"
                   :old_value (pr-str old-row)
                   :new_value (pr-str (assoc old-row column new-value))
                   :delta     (pr-str {column value})})

      (events/publish-event! :event/table-mutation-cell-update
                             {:object-id field-id
                              :object    {:field-id field-id
                                          :table-id table_id
                                          :pk    row-pk
                                          :value-new value
                                          ;; TODO get this
                                          :value-old old-value}
                              :user-id   (or api/*current-user-id* (t2/select-one-pk :model/User :is_superuser true))}))))

(api.macros/defendpoint :put "/field/:field-id/:row-pk"
  "Update the given value in the underlying table."
  [{:keys [field-id row-pk]} :- [:map
                                 [:field-id ms/PositiveInt]
                                 [:row-pk ms/PositiveInt]]
   {}
   {:keys [value]} :- [:map [:value :any]]]
  (update-cell! field-id row-pk value))

(defn- track-insert! [table-id rows]
  (let [pks (t2/select :model/Field :table_id table-id :semantic_type :type/PK)]
    ;; only track hacky audit trail if there's a single PK
    (when (= 1 (count pks))
      (let [pk-name (keyword (:name (first pks)))]
        (doseq [r rows :let [row-pk (get r pk-name)]]
          (t2/insert! :model/TableEdit
                      {:table_id  table-id
                       :type      "insert"
                       :pk        row-pk
                       :old_value nil
                       :new_value (pr-str r)
                       :delta     (pr-str r)})))))

  (events/publish-event! :event/table-mutation-row-insert
                         {:object  {:table-id table-id
                                    :rows     rows}
                          :user-id (or api/*current-user-id* (t2/select-one-pk :model/User :is_superuser true))}))

(defn track-delete! [table-id pks pk+old-rows]
  (let [pk-name (keyword (:name (first pks)))]
    (doseq [old-row #p pk+old-rows
            :let [row-pk (get old-row pk-name)]]

      (t2/insert! :model/TableEdit
                  {:table_id  table-id
                   :pk        row-pk
                   :type      "delete"
                   :old_value (pr-str old-row)
                   :new_value nil
                   :delta     nil})

      (events/publish-event! :event/table-mutation-row-delete
                             {:object  {:table-id table-id
                                        :pk       row-pk
                                        :row      old-row}
                              :user-id (or api/*current-user-id* (t2/select-one-pk :model/User :is_superuser true))}))))

(defn delete-row! [table-id row-pk]
  (let [{table :name :keys [db_id schema]} (api/check-404 (t2/select-one :model/Table table-id))
        pks    (t2/select :model/Field :table_id table-id :semantic_type :type/PK)
        driver (driver/the-driver (:engine (t2/select-one :model/Database db_id)))]
    (assert (= 1 (count pks)) "Table must have a PK and it cannot be compound")

    (let [old-row (let [sql (sql/format {:select [:*]
                                         :from   [(keyword table)]
                                         :where  [:= row-pk (keyword (:name (first pks)))]}
                                        :quoted true
                                        :dialect (sql.qp/quote-style driver))]
                    (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db_id)]
                      (first (jdbc/query conn sql))))]

      (api/check-404 old-row)

      (when (driver.sql-jdbc/delete-row! driver
                                         db_id
                                         schema
                                         table
                                         (:name (first pks))
                                         row-pk)

        (track-delete! table-id pks [old-row])))))

(api.macros/defendpoint :delete "/table/:table-id/:row-pk"
  [{:keys [table-id row-pk]} :- [:map
                                 [:table-id ms/PositiveInt]
                                 [:row-pk   ms/PositiveInt]]]
  (delete-row! table-id row-pk))

(defn- insert-rows!* [driver db-id table-id table rows]
  (let [with-pks (driver.sql-jdbc/insert-returning-pks! driver db-id table (keys (first rows)) (map vals rows))]
    (track-insert! table-id with-pks)))

(defn- insert-row! [table-id row]
  ;; don't bother checking whether PK(s) value is/are provided iff the PK(s) is/are not auto-incrementing
  (let [{table :name :keys [db_id schema]} (api/check-404 (t2/select-one :model/Table table-id))
        driver (driver/the-driver (:engine (t2/select-one :model/Database db_id)))
        rows [row]]
    (insert-rows!* driver db_id table-id table rows)))

(api.macros/defendpoint :post "/table/:table-id"
  [{:keys [table-id]} :- [:map
                          [:table-id ms/PositiveInt]]
   {}
   {:keys [row]} :- [:map [:row :any]]]
  (insert-row! table-id row))

(defn- apply-jq [data jq]
  (if jq
    (json/decode+kw (http-action/apply-json-query data jq))
    data))

(api.macros/defendpoint :post "/webhook/:table-id"
  [{:keys [table-id]} :- [:map [:table-id :int]]
   {:keys [jq]}
   data]
  (let [{table :name :keys [db_id]} (api/check-404 (t2/select-one :model/Table table-id))
        driver                      (driver/the-driver (:engine (t2/select-one :model/Database db_id)))
        row-or-rows                 (apply-jq data jq)
        rows                        (if (vector? row-or-rows) row-or-rows [row-or-rows])]
    (insert-rows!* driver db_id table-id table rows)
    :done))

(comment
  (def table (t2/select-one :model/Table :name "PEOPLE"))
  (def field-id (t2/select-one-fn :id [:model/Field :id] :table_id (:id table) :name "NAME"))
  (update-cell! field-id 1 "Dr Celery Celsius")

  (t2/select-fn-vec (juxt :name :database_type) [:model/Field :database_type :name :table_id] :table_id (t2/select-one-pk :model/Table :name "PEOPLE"))
  (u/index-by :database_type (juxt :table_id :name) (t2/select :model/Field))
  (t2/select-one-fn :name :model/Table 219))
