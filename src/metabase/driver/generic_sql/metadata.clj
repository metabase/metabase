(ns metabase.driver.generic-sql.metadata)

;; TODO - These implementations are wack. We should just use korma to do this instead of raw SQL

(defn field-count
  [{:keys [db table name]}]
  (-> ((:native-query @db)
       (format "SELECT COUNT(\"%s\".\"%s\") AS count FROM \"%s\""
               (:name @table)
               name
               (:name @table)))
      first
      :count))

(defn field-distinct-count
  [{:keys [db table name]}]
  (-> ((:native-query @db)
       (format "SELECT COUNT(DISTINCT \"%s\".\"%s\") AS count FROM \"%s\""
               (:name @table)
               name
               (:name @table)))
      first
      :count))
