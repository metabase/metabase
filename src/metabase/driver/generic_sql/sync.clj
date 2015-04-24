(ns metabase.driver.generic-sql.sync
  "Generic implementations of `metabase.driver` `(sync-tables [db]) function that should work across any SQL database supported by Korma."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.math.numeric-tower :as math]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.sync :as sync]
            [metabase.driver.generic-sql.util :refer :all]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.util :as u]))

;; # NEW IMPL

(deftype GenericSqlSyncDriverDatasource [column->base-type sql-string-length-fn ^java.sql.DatabaseMetaData metadata]
  sync/ISyncDriverDataSource
  (active-table-names [_ database]
    (->> (.getTables metadata nil nil nil (into-array String ["TABLE"]))
         jdbc/result-set-seq
         (map :table_name)
         set))

  (active-column-names->type [_ table]
    (->> (.getColumns metadata nil nil (:name table) nil)
         jdbc/result-set-seq
         (filter #(not= (:table_schem %) "INFORMATION_SCHEMA")) ; filter out internal tables
         (map (fn [{:keys [column_name type_name]}]
                {column_name (column->base-type (or (keyword type_name)
                                                    :UnknownField))}))
         (into {})))

  (table-pks [_ table]
    (->> (.getPrimaryKeys metadata nil nil (:name table))
         jdbc/result-set-seq
         (map :column_name)
         set))

  sync/ISyncDriverTableFKs
  (table-fks [_ table]
    (->> (.getImportedKeys metadata nil nil (:name table))
         jdbc/result-set-seq
         (map (fn [result]
                {:fk-column-name   (:fkcolumn_name result)
                 :dest-table-name  (:pktable_name result)
                 :dest-column-name (:pkcolumn_name result)}))
         set))

  sync/ISyncDriverFieldValues
  (field-values-lazy-seq [_ field]
    (let [korma-table (korma-entity @(:table field))]
      (->> (select korma-table (fields [(keyword (:name field)) :value]))
           (map :value))))

  sync/ISyncDriverFieldAvgLength
  (field-avg-length [_ field]
    (or (some-> (korma-entity @(:table field))
                (select (aggregate (avg (sqlfn* sql-string-length-fn
                                                (raw (format "CAST(\"%s\" AS TEXT)" (name (:name field))))))
                                   :len))
                first
                :len
                int)
        0))

  sync/ISyncDriverFieldPercentUrls
  (field-percent-urls [_ field]
    (let [korma-table (korma-entity @(:table field))
          total-non-null-count (-> (select korma-table
                                           (aggregate (count :*) :count)
                                           (where {(keyword (:name field)) [not= nil]})) first :count)]
      (if (= total-non-null-count 0) 0
          (let [url-count (-> (select korma-table
                                      (aggregate (count :*) :count)
                                      (where {(keyword (:name field)) [like "http%://_%.__%"]})) first :count)]
            (float (/ url-count total-non-null-count)))))))
