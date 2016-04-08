(ns metabase.driver.crate.generic-sql
  (:require [metabase.driver.generic-sql :as sql]
            [korma.core :as k]
            [metabase.models.field :as field]
            [metabase.driver.sync :as sync]))

(defn- field-avg-length [_ field]
  (or (some-> (sql/korma-entity (field/table field))
              (k/select (k/aggregate (avg (k/sqlfn :CHAR_LENGTH
                                                   (sql/escape-field-name (:name field))))
                                     :len))
              first
              :len
              int)
      0))

(defn- field-percent-urls [_ field]
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
  ((sync/make-analyze-table driver
                            :field-avg-length-fn (partial field-avg-length driver)
                            :field-percent-urls-fn (partial field-percent-urls driver))
    driver
    table
    new-table-ids))
