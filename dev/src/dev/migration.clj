(ns dev.migration
  (:require
   [metabase.db :as mdb]
   [metabase.db.liquibase :as liquibase]
   [toucan2.core :as t2])
  (:import
   (liquibase Liquibase)))

(set! *warn-on-reflection* true)

(defn- latest-migration
  []
  ((juxt :id :comments)
   (t2/query-one {:select [:id :comments]
                  :from   [:databasechangelog]
                  :order-by [[:orderexecuted :desc]]
                  :limit 1})))
(defn migrate!
  "Run migrations for the Metabase application database. Possible directions are `:up` (default), `:force`, `:down`, and
  `:release-locks`. When migrating `:down` pass along a version to migrate to (44+)."
  ([]
   (migrate! :up))
  ;; do we really use this in dev?
  ([direction & [version]]
   (mdb/migrate! (mdb/db-type) (mdb/data-source)
                 direction version)
   (println "Latest migration:" (latest-migration))))

(defn- rollback-n-migration!
  [n]
  (with-open [conn (.getConnection (mdb/data-source))]
    (liquibase/with-liquibase [^Liquibase liquibase conn]
      (liquibase/with-scope-locked liquibase
        (.rollback liquibase n "")))))

(defn- id->n-to-rollback
  [id]
  (->> (t2/query-one {:select [[:%count.* :count]]
                              :from   [:databasechangelog]
                              :where  [:> :orderexecuted {:select [:orderexecuted]
                                                          :from   [:databasechangelog]
                                                          :where  [:= :id id]
                                                          :limit 1}]
                              :limit 1})
       :count
       ;; includes the selected id
       inc))

(defn rollback!
  "Rollback helper, can take a number of migrations to rollback or a specific migration ID(inclusive).

    ;; Rollback 2 migrations:
    (rollback! 2)

    ;; rollback to \"v50.2024-03-18T16:00:00\" (inclusive)
    (rollback! \"v50.2024-03-18T16:00:00\")"
  [n-or-id]
  (let [n (if (integer? n-or-id)
              n-or-id
              (id->n-to-rollback n-or-id))]
   (rollback-n-migration! n)
   (println (format "Rollbacked %d migrations. Latest migration: %s" n (latest-migration)))))
