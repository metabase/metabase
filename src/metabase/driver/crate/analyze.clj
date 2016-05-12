(ns metabase.driver.crate.analyze
  (:require [korma.core :as k]
            [metabase.driver.generic-sql :as sql]
            [metabase.models.field :as field]
            [metabase.sync-database.analyze :as analyze]))

(defn- field-avg-length [field]
  (or (some-> (sql/korma-entity (field/table field))
              (k/select (k/aggregate (avg (k/sqlfn :CHAR_LENGTH
                                                   (sql/escape-field-name (:name field))))
                                     :len))
              first
              :len
              int)
      0))

(defn- field-percent-urls [field]
  (or (let [korma-table (sql/korma-entity (field/table field))]
        (when-let [total-non-null-count (:count (first (k/select korma-table
                                                         (k/aggregate (count (k/raw "*")) :count)
                                                         (k/where {(sql/escape-field-name (:name field)) [not= nil]}))))]
          (when (> total-non-null-count 0)
            (when-let [url-count (:count (first (k/select korma-table
                                                  (k/aggregate (count (k/raw "*")) :count)
                                                  (k/where {(sql/escape-field-name (:name field)) [like "http%://_%.__%"]}))))]
              (float (/ url-count total-non-null-count))))))
      0.0))

(defn analyze-table
  "Default implementation of `analyze-table` for SQL drivers."
  [driver table new-table-ids]
  ((analyze/make-analyze-table driver
                               :field-avg-length-fn   field-avg-length
                               :field-percent-urls-fn field-percent-urls)
    driver
    table
    new-table-ids))
