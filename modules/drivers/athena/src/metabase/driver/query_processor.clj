(ns metabase.driver.query-processor
  (:require [clojure.string :as str]
            [metabase.query-processor
             [store :as qp.store]]
            [metabase.util
             [honeysql-extensions :as hx]]
            [metabase.driver.sql.query-processor :as sql.qp]))

(defn get-parent-qualifiers [field-identifier]
  (:components field-identifier))

(defn format-field-identifier [field-identifier]
  (apply hx/identifier :field field-identifier))

(defn get-field-full-name [qualifiers field-name parent-id]
  (if (nil? parent-id)
    (concat qualifiers [field-name])
    (concat (get-parent-qualifiers (sql.qp/->honeysql :athena [:field-id parent-id])) [field-name])))

(defn ->honeysql [driver {field-name :name, table-id :table_id, parent-id :parent_id :as field}]
  (let [qualifiers (if sql.qp/*table-alias*
                     [sql.qp/*table-alias*]
                     (let [{schema :schema, table-name :name} (qp.store/table table-id)]
                       [schema table-name]))]
    (->>
     (get-field-full-name qualifiers field-name parent-id)
     (format-field-identifier)
     (sql.qp/cast-field-if-needed driver field))))