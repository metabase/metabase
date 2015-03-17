(ns metabase.driver.generic-sql.metadata
  (:require [korma.core :as korma]
            [metabase.driver.generic-sql.util :refer :all]))

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
