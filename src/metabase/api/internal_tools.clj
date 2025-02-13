(ns metabase.api.internal-tools
  (:require
   [clojure.java.jdbc :as jdbc]
   [honey.sql :as sql]
   [medley.core :as m]
   ^{:clj-kondo/ignore [:metabase/ns-module-checker]}
   [metabase.actions.core :as actions]
   [metabase.actions.http-action :as http-action]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc :as driver.sql-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.events :as events]
   [metabase.models.action :as action]
   [metabase.models.cell-edit]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(comment
  metabase.models.cell-edit/keep-me)

(derive ::event :metabase/event)
(derive :event/table-mutation-cell-update ::event)
(derive :event/table-mutation-updates ::event)
(derive :event/table-mutation-row-insert ::event)
(derive :event/table-mutation-row-delete ::event)

(defn- parse-value [base-type v]
  ;; TODO this logic is duplicated with metabase.query-processor.middleware.auto-parse-filter-values
  ;; factor out or decide what to do
  ;; thought: need to parse dates and stuff but integers could maybe be passed as json numbers to the server
  (condp #(isa? %2 %1) base-type
    :type/BigInteger (bigint v)
    :type/Integer (if (int? v) v (parse-long v))
    :type/Decimal    (bigdec v)
    :type/Float      (parse-double v)
    :type/Boolean    (parse-boolean v)
    v))

(defn track-update!
  "A bit of a gotcha - this does not send cell update events - but we should just deprecate those."
  [table-id row-pk old-row new-row]
  (events/publish-event! :event/table-mutation-updates
                         {:object  {:table-id table-id
                                    :updates  [{:before old-row
                                                :after  new-row}]}
                          :user-id (or api/*current-user-id*
                                       (t2/select-one-pk :model/User :is_superuser true))})

  (t2/insert! :model/TableEdit
              {:table_id  table-id
               :pk        row-pk
               :type      "edit"
               :old_value (pr-str old-row)
               :new_value (pr-str new-row)
               :delta     (pr-str (into {} (keep (fn [[k v]] (when (not= v (get old-row k))
                                                               [k v]))
                                                 new-row)))}))

(defn track-cell-update! [table-id row-pk field-id column old-row new-value]
  (track-update! table-id row-pk old-row (assoc old-row column new-value))

  (events/publish-event! :event/table-mutation-cell-update
                         {:object-id field-id
                          :object    {:field-id field-id
                                      :table-id table-id
                                      :pk    row-pk
                                      :value-new new-value
                                      :value-old (get old-row column)}
                          :user-id   (or api/*current-user-id* (t2/select-one-pk :model/User :is_superuser true))}))

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
          new-value (parse-value base_type value)]

      (driver.sql-jdbc/update-row-column! driver
                                          db_id
                                          schema
                                          table
                                          (:name (first pks))
                                          row-pk
                                          column
                                          new-value)

      (when (= :type/Category semantic_type)
        ;; if the field-values haven't been created yet, e.g. because there are no values, it doesn't exist already, you're SOH
        (when-let [field-values (t2/select-one-fn :values :model/FieldValues :field_id field-id)]
          (when (not (some #{value} field-values))
            (t2/update! :model/FieldValues {:field_id field-id} {:values (conj field-values value)}))))

      (track-cell-update! table_id row-pk field-id column old-row new-value))))

(api.macros/defendpoint :put "/field/:field-id/:row-pk"
  "Update the given value in the underlying table."
  [{:keys [field-id row-pk]} :- [:map
                                 [:field-id ms/PositiveInt]
                                 [:row-pk ms/PositiveInt]]
   {}
   {:keys [value]} :- [:map [:value :any]]]
  (update-cell! field-id row-pk value))

(defn track-insert! [table-id rows]
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
    (doseq [old-row pk+old-rows
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
  (let [{table :name :keys [db_id]} (api/check-404 (t2/select-one :model/Table table-id))
        fields (t2/select :model/Field :table_id table-id)
        name->field (u/index-by :name fields)
        row (m/map-kv-vals (fn [k v]
                             (if-some [{:keys [base_type]} (name->field (name k))]
                               (parse-value base_type v)
                               v))
                           row)
        driver (driver/the-driver (:engine (t2/select-one :model/Database db_id)))
        rows [row]]
    (insert-rows!* driver db_id table-id table rows)))

(api.macros/defendpoint :post "/table/:table-id"
  [{:keys [table-id]} :- [:map
                          [:table-id ms/PositiveInt]]
   {}
   {:keys [row]} :- [:map [:row :any]]]
  (insert-row! table-id row))

(defn- create-table! [db-id schema table-name columns]
  (let [driver (driver/the-driver (:engine (t2/select-one :model/Database db-id)))]
    (driver.sql-jdbc/create-table! driver db-id schema table-name columns)))

(api.macros/defendpoint :post "/table"
  [{}
   {}
   {:keys [db_id
           schema
           table_name
           columns]}
   :- [:map
       [:db_id ms/PositiveInt]
       [:schema {:optional true} :string]
       [:table_name :string]
       [:columns [:seqable [:map
                            [:name :string]
                            [:type [:enum "Boolean" "Integer" "BigInteger" "Text" "DateTime"]]
                            [:primary_key {:optional true} [:maybe :boolean]]
                            [:nullable {:optional true} [:maybe :boolean]]
                            [:auto_increment {:optional true} [:maybe :boolean]]
                            [:default_value {:optional true} [:maybe :any]]]]]]]
  (let [columns' (for [{:keys [name
                               type
                               primary_key
                               nullable
                               auto_increment
                               default_value]} columns
                       :let [base-type (keyword "type" type)]]
                   {:column-name name
                    :column-type base-type
                    :primary-key primary_key
                    :nullable nullable
                    :auto-increment auto_increment
                    :default-value (some->> default_value not-empty (parse-value base-type))})]
    (create-table! db_id schema table_name columns')
    (sync/sync-database! (t2/select-one :model/Database db_id))))

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

(defn- revert-to! [id]
  (let [{t :type :keys [table_id pk old_value]} (t2/select-one :model/TableEdit id)
        old-row (when old_value (read-string old_value))]
    (case t
      "insert" (delete-row! table_id pk)
      "delete" (insert-row! table_id old-row)
      "edit"
      (doseq [[k v] old-row
              :when (not= k :id)]
        (let [field-id (t2/select-one-pk :model/Field :table_id table_id :name (name k))]
          (update-cell! field-id pk v))))))

(api.macros/defendpoint :post "/row-action/:action-id"
  [{:keys [action-id]} :- [:map [:action-id :int]]
   _
   {:keys [table-id pk]} :- [:map
                             [:table-id :int]
                             [:pk :int]]]
  (let [_  [table-id pk]
        pks   (api/check-404 (t2/select :model/Field :table_id table-id :semantic_type :type/PK))
        _     (assert (= 1 (count pks)))
        db_id (api/check-404 (t2/select-one-fn :db_id :model/Table table-id))
        action (when (not= action-id 8008135)
                 (api/check-404 (action/select-action :id action-id)))
        driver (driver/the-driver (:engine (t2/select-one :model/Database db_id)))
        row   (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db_id)]
                (first (jdbc/query conn (sql/format {:select [:*]
                                                   :from   [(keyword (t2/select-one-fn :name :model/Table table-id))]
                                                   :where  [:= pk (keyword (:name (first pks)))]}
                                                  :quoted true
                                                  :dialect (sql.qp/quote-style driver)))))
        col->param-id (into {} (map (juxt :slug :id) (:parameters action)))]
    (if (= action-id 8008135)
      (revert-to! pk)
      (actions/execute-action! action (into {} (map (fn [[col val]] (when-let [k (col->param-id (name col))] [k val])) row))))))

(comment
  (def table (t2/select-one :model/Table :name "PEOPLE"))
  (def field-id (t2/select-one-fn :id [:model/Field :id] :table_id (:id table) :name "NAME"))
  (update-cell! field-id 1 "Dr Celery Celsius")

  (t2/select-fn-vec (juxt :name :database_type) [:model/Field :database_type :name :table_id] :table_id (t2/select-one-pk :model/Table :name "PEOPLE"))
  (u/index-by :database_type (juxt :table_id :name) (t2/select :model/Field))
  (t2/select-one-fn :name :model/Table 219))

(t2/select-one-fn :id :model/Table :name "test_user")
