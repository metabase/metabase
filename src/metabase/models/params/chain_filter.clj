(ns metabase.models.params.chain-filter
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase
             [driver :as driver]
             [models :refer [Field Table]]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor.middleware.wrap-value-literals :as wrap-value-literals]
            [metabase.query-processor.store :as qp.store]
            [toucan.db :as db]))

(defn- chain-filter-add-where-clause [honeysql-form table-id field->value]
  (qp.store/fetch-and-store-fields! (keys field->value))
  (transduce
   (map (fn [[filter-field-id value]]
          (sql.qp/->honeysql driver/*driver*
            (wrap-value-literals/wrap-value-literals-in-mbql
             (vec (cond
                    (vector? value)
                    (let [[operator & args] value]
                      (list* operator [:field-id filter-field-id] args))

                    (set? value)
                    (cons :or (for [v value]
                                [:= [:field-id filter-field-id] v]))

                    :else
                    [:= [:field-id filter-field-id] value]))))))
   (completing h/merge-where)
   honeysql-form
   field->value))

(defn resolve-fk-id [table-1-id table-2-id]
  (first
   (db/query {:select    [[:source-field.id :f1]
                          [:source-table.id :t1]
                          [:dest-field.id :f2]
                          [:dest-table.id :t2]]
              :from      [[Field :source-field]]
              :left-join [[Table :source-table] [:= :source-field.table_id :source-table.id]
                          [Field :dest-field]   [:= :source-field.fk_target_field_id :dest-field.id]
                          [Table :dest-table]   [:= :dest-field.table_id :dest-table.id]]
              :where     [:or
                          [:and
                           [:= :source-table.id table-1-id]
                           [:= :dest-table.id table-2-id]]
                          [:and
                           [:= :source-table.id table-2-id]
                           [:= :dest-table.id table-1-id]]]
              :limit     1})))

(defn- chain-filter-add-joins [honeysql-form source-table-id field-ids]
  (qp.store/fetch-and-store-fields! field-ids)
  (let [fk-infos (when (seq field-ids)
                   (when-let [other-table-ids (not-empty (disj (set (map (comp :table_id qp.store/field) field-ids))
                                                               source-table-id))]
                     (map (partial resolve-fk-id source-table-id) other-table-ids)))]
    (qp.store/fetch-and-store-tables! (mapcat (juxt :t1 :t2) fk-infos))
    (qp.store/fetch-and-store-fields! (mapcat (juxt :f1 :f2) fk-infos))
    (transduce
     (map (fn [{:keys [t1 f1 t2 f2]}]
            [(sql.qp/->honeysql driver/*driver* (Table (if (= t1 source-table-id)
                                                         t2
                                                         t1)))
             [:=
              (sql.qp/->honeysql driver/*driver* [:field-id f1])
              (sql.qp/->honeysql driver/*driver* [:field-id f2])]]))
     (completing (partial apply h/merge-left-join))
     honeysql-form
     fk-infos)))

(defn- chain-filter-handle-options [honeysql-form field-id options]
  (let [field-id-clause (sql.qp/->honeysql driver/*driver* [:field-id field-id])]
    (reduce
     (fn [honeysql-form [option arg]]
       (case (keyword option)
         :like  (h/merge-where honeysql-form [:like (hsql/call :lower field-id-clause) (str/lower-case arg)])
         :limit (assoc honeysql-form :limit arg)))
     honeysql-form
     (partition 2 options))))

(defn- chain-filter-sql [field-id field->value options]
  (qp.store/fetch-and-store-fields! [field-id])
  (let [table-id (:table_id (qp.store/field field-id))
        _        (qp.store/fetch-and-store-tables! [table-id])
        honeysql (-> {:modifiers [:distinct]
                      :select    [[(sql.qp/->honeysql driver/*driver* [:field-id field-id]) :v]]
                      :from      [(sql.qp/->honeysql driver/*driver* (qp.store/table table-id))]
                      :order-by  [[:v :asc]]}
                     (chain-filter-add-joins table-id (keys field->value))
                     (chain-filter-add-where-clause table-id field->value)
                     (chain-filter-handle-options field-id options))]
    (try
      (sql.qp/format-honeysql driver/*driver* honeysql)
      (catch Throwable e
        (throw (ex-info "Error compiling HoneySQL form" {:honeysql honeysql} e))))))

(defn chain-filter [database-id field-id field->value & options]
  (qp.store/with-store
    (qp.store/fetch-and-store-database! database-id)
    (driver/with-driver (:engine (qp.store/database))
      (let [spec (sql-jdbc.conn/connection-details->spec driver/*driver* (:details (qp.store/database)))
            sql  (chain-filter-sql field-id field->value options)]
        (println "sql:" (pr-str sql))   ; NOCOMMIT
        (map :v (jdbc/query spec sql))))))
