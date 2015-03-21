(ns metabase.driver.generic-sql.metadata
  (:require [korma.core :as korma]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql.util :refer :all]
            [metabase.util :as u]))

;; TODO - These implementations are wack. We should just use korma to do this instead of raw SQL

(defn field-count
  [{:keys [db table name]}]
  (-> (korma/exec-raw
        (korma-db @db)
        (format "SELECT COUNT(\"%s\".\"%s\") AS count FROM \"%s\""
          (:name @table)
          name
          (:name @table))
        :results)
      first
      :count))

(defn field-distinct-count
  [{:keys [db table name]}]
  (-> (korma/exec-raw
        (korma-db @db)
        (format "SELECT COUNT(DISTINCT \"%s\".\"%s\") AS count FROM \"%s\""
          (:name @table)
          name
          (:name @table))
        :results)
      first
      :count))

;; WHY IS THIS IN GENERIC-SQL ?
;; IT'S ACTUALLY DRIVER INDEPENDENT, SUPPOSEDLY
(defn field-distinct-values
  "Get the distinct values of FIELD (via the Query Processor)."
  {:arglists '([field])}
  [{field-id :id :as field}]
  (->> (driver/process-and-run
        {:type :query
         :database ((u/deref-> field :table :db) :id)
         :query {:source_table ((u/deref-> field :table) :id) ; should we add a limit here? In case someone is dumb and tries to get millions of distinct values?
                 :aggregation ["rows"]                        ; or should we let them do it
                 :breakout [field-id]}})
       :data
       :rows
       (map first)))
