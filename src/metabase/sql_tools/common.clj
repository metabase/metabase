^{:clj-kondo/ignore [:metabase/modules]}
(ns metabase.sql-tools.common
  (:require
   [metabase.driver.sql :as driver.sql]
   ;; TODO what to do
   [metabase.driver.sql.normalize :as sql.normalize]))

;; driver.sql
(defn normalize-table-spec
  "WIP"
  [driver {:keys [table schema]}]
  {:table (sql.normalize/normalize-name driver table)
   :schema (some->> schema (sql.normalize/normalize-name driver))})

;; driver.sql
(defn find-table-or-transform
  "Given a table and schema that has been parsed out of a native query, finds either a matching table or a matching transform.
   It will return either {:table table-id} or {:transform transform-id}, or nil if neither is found."
  [driver tables transforms {search-table :table raw-schema :schema}]
  (let [search-schema (or raw-schema
                          (driver.sql/default-schema driver))
        matches? (fn [db-table db-schema]
                   (and (= search-table db-table)
                        (= search-schema db-schema)))]
    (or (some (fn [{:keys [name schema id]}]
                (when (matches? name schema)
                  {:table id}))
              tables)
        (some (fn [{:keys [id] {:keys [name schema]} :target}]
                (when (matches? name schema)
                  {:transform id}))
              transforms))))