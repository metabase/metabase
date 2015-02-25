(ns metabase.driver.postgres.metadata
  (:require [metabase.driver.metadata :refer [field-count field-distinct-count]]))

;; TODO - These implementations are wack. We should just use korma to do this
;; and these should be moved to the `generic-sql` driver

(defmethod field-count :postgres
  [{:keys [db table name] :as field}]
  (-> ((:native-query @db)
       (format "SELECT COUNT(\"%s\".\"%s\") FROM \"%s\""
               (:name (table))
               name
               (:name (table))))
      first
      :count))

(defmethod field-distinct-count :postgres
  [{:keys [db table name] :as field}]
  (-> ((:native-query @db)
       (format "SELECT COUNT(DISTINCT \"%s\".\"%s\") FROM \"%s\""
               (:name (table))
               name
               (:name (table))))
      first
      :count))
