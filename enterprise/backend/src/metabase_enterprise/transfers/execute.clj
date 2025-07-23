(ns metabase-enterprise.transfers.execute
  (:require [honey.sql.helpers :as sql.helpers]
            [metabase-enterprise.legos.core :as legos]
            [metabase-enterprise.transforms.execute :as transforms.execute]
            [metabase.driver :as driver]
            [metabase.driver.postgres :as pg]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor :as qp]
            [metabase.query-processor.compile :as qp.compile]
            [metabase.util.malli.registry :as mr]
            [toucan2.core :as t2]))

(def ^:private type-map
  "Map of Field base types -> Postgres column types.

  Created by manually reversing the postgres driver default-base-types map and resolving
  conflicts by picking the most 'general' postgres type."
  {:type/BigInteger          :bigint
   :type/Boolean             :boolean
   :type/Decimal             :decimal
   :type/Float               (keyword "double precision")
   :type/Integer             :integer
   :type/IPAddress           :inet
   :type/JSON                :jsonb
   :type/Structured          :text
   :type/Text                :text
   :type/Date                :date
   :type/DateTime            :timestamp
   :type/DateTimeWithLocalTZ :timestamptz
   :type/Time                :time
   :type/TimeWithLocalTZ     :timetz
   :type/UUID                :uuid})

(defn- make-table [{:keys [input-fields output-db-ref output-table-name overwrite?]}]
  (let [fields (for [{:keys [base_type nfc_path parent_id] :as field} input-fields
                     :let [pg-type (type-map base_type)]
                     :when (and (not nfc_path) (not parent_id) pg-type)]
                 (assoc field :pg-type pg-type))]
    (when overwrite?
      (transforms.execute/execute-query :postgres output-db-ref (driver/compile-drop-table :postgres (keyword output-table-name))))

    (-> (sql.helpers/create-table (keyword output-table-name))
        (sql.helpers/with-columns (for [{:keys [name pg-type]} fields]
                                    [(keyword name) pg-type]))
        (->> (sql.qp/format-honeysql :postgres))
        (->> (transforms.execute/execute-query :postgres output-db-ref)))
    fields))

(def #^:private step-size 100)

(defn- get-data [input-table fields]
  (-> {:database (:db_id input-table)
       :type :query
       :query {:source-table (:id input-table)
               :fields (mapv (fn [{:keys [id]}]
                               [:field id])
                             fields)}
       :middleware {:disable-remaps? true}}
      qp/process-query
      :data
      :rows
      (->> (partition step-size))))

(defn- cast-row [row fields]
  (map (fn [val {:keys [pg-type name]}]
         [:cast val pg-type])
       row
       fields))

(defn- insert-data [{:keys [data output-db-ref fields output-table-name]}]
  (let [cast-data (map (fn [row]
                         (cast-row row fields))
                       data)
        query (-> (sql.helpers/insert-into (keyword output-table-name))
                  (as-> query (apply sql.helpers/columns query (map (fn [{:keys [name]}]
                                                                      (keyword name))
                                                                    fields)))
                  (sql.helpers/values cast-data)
                  (->> (sql.qp/format-honeysql :postgres)))]
    (transforms.execute/execute-query :postgres output-db-ref query)))

(defn execute [{:keys [input-table output-db-ref output-table-name overwrite?] :as args}]
  (let [input-fields (t2/select :model/Field :table_id (:id input-table))
        fields (make-table {:input-fields input-fields
                            :output-db-ref output-db-ref
                            :output-table-name output-table-name
                            :overwrite? overwrite?})
        data (get-data input-table fields)]
    (doseq [page data]
      (insert-data {:data page
                    :output-db-ref output-db-ref
                    :output-table-name output-table-name
                    :fields fields}))))

(mr/def ::transfer
  [:map
   [:lego [:= "transfer"]]
   [:source_database :int]
   [:source_table :string]
   [:destination_database :int]
   [:destination_table :string]
   [:overwrite? :bool]])

(defmethod legos/execute! :transfer
  [{:keys [source_database source_table destination_database destination_table overwrite?]}]
  (let [input-table (t2/select-one :model/Table :db_id source_database :name source_table)]
    (execute {:input-table input-table
              :output-db-ref destination_database
              :output-table-name destination_table
              :overwrite? overwrite?})))
