(ns dev.migrate
  (:gen-class)
  (:require
   [clojure.string :as str]
   [metabase.db :as mdb]
   [metabase.db.liquibase :as liquibase]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import
   (liquibase Contexts Liquibase RuntimeEnvironment)
   (liquibase.changelog ChangeLogIterator)
   (liquibase.changelog.filter ChangeSetFilter)
   (liquibase.sqlgenerator SqlGeneratorFactory)
   (liquibase.changelog.visitor ListVisitor)))

(set! *warn-on-reflection* true)

(defn- latest-migration
  []
  ((juxt :id :comments)
   (t2/query-one {:select [:id :comments]
                  :from   [(keyword (liquibase/changelog-table-name (mdb/data-source)))]
                  :order-by [[:orderexecuted :desc]]
                  :limit 1})))
(defn migrate!
  "Run migrations for the Metabase application database. Possible directions are `:up` (default), `:force`, `:down`, and
  `:release-locks`. When migrating `:down` pass along a version to migrate to (44+)."
  ([]
   (migrate! :up))
  ;; do we really use this in dev?
  ([direction & [version]]
   (mdb/migrate! (mdb/data-source) direction version)
   #_{:clj-kondo/ignore [:discouraged-var]}
   (println "Migrated up. Latest migration:" (latest-migration))))

(defn- rollback-n-migrations!
  [^Integer n]
  (with-open [conn (.getConnection (mdb/data-source))]
    (liquibase/with-liquibase [^Liquibase liquibase conn]
      (liquibase/with-scope-locked liquibase
        (.rollback liquibase n "")))))

(defn- migration-since
  [id]
  (->> (t2/query-one {:select [[:%count.* :count]]
                      :from   [:databasechangelog]
                      :where  [:> :orderexecuted {:select   [:orderexecuted]
                                                  :from     [:databasechangelog]
                                                  :where    [:like :id (format "%s%%" id)]
                                                  :order-by [:orderexecuted :desc]
                                                  :limit    1}]
                      :limit 1})
       :count
       ;; includes the selected id
       inc))

(defn- maybe-parse-long
  [x]
  (cond-> x
    (string? x)
    parse-long))

(mu/defn rollback!
  "Rollback helper, can take a number of migrations to rollback or a specific migration ID(inclusive).

    ;; Rollback 2 migrations:
    (rollback! :count 2)

    ;; rollback to \"v50.2024-03-18T16:00:00\" (inclusive)
    (rollback! :id \"v50.2024-03-18T16:00:00\")"
 [k :- [:enum :id :count "id" "count"]
  target]
 (let [n (case (keyword k)
           :id    (migration-since target)
           :count (maybe-parse-long target))]
  (rollback-n-migrations! n)
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println (format "Rollbacked %d migrations. Latest migration: %s" n (latest-migration)))))

(defn migration-status
  "Print the latest migration ID."
  []
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println "Current migration:" (latest-migration)))

(defn -main
  "Migrations helpers

  Usage:
    clojure -M:migrate up                         ;; migrate up to the latest
    clojure -M:migrate rollback count 2           ;; rollback 2 migrations
    clojure -M:migrate rollback id \"v40.00.001\" ;; rollback to a specific migration with id
    clojure -M:migrate status                     ;; print the latest migration id"

  [& args]
  (let [[cmd & migration-args] args]
    (case cmd
      "rollback"
      (apply rollback! migration-args)

      "up"
      (apply migrate! migration-args)

      "status"
      (migration-status)

      (throw (ex-info "Invalid command" {:command cmd
                                         :args    args})))))

(defn- stmts-to-sql
  [stmts sql-generator-factory database]
  (str/join "\n" (for [stmt stmts
                       sql (.generateSql ^SqlGeneratorFactory sql-generator-factory stmt database)]
                   (.toString sql))))

(defn- change->sql
  [change sql-generator-factory database]
  {:forward  (stmts-to-sql (.generateStatements change database) sql-generator-factory database)
   :rollback (stmts-to-sql (.generateRollbackStatements change database) sql-generator-factory database)})

(defn migration-sql-by-id
  "Get the sql statements for a specific migration ID.
    (migration-sql-by-id \"v51.2024-06-12T18:53:02\")
    ;; =>
      {:forward \"DROP INDEX public.idx_user_id_device_id;\",
       :rollback \"CREATE INDEX idx_user_id_device_id ON public.login_history(session_id, device_id);\"}"
  [id]
  (t2/with-connection [conn]
    (liquibase/with-liquibase [^Liquibase liquibase conn]
      (let [database            (.getDatabase liquibase)
            change-log-iterator (ChangeLogIterator. (.getDatabaseChangeLog liquibase) (into-array ChangeSetFilter []))
            list-visistor       (ListVisitor.)
            runtime-env         (RuntimeEnvironment. database (Contexts.) nil)
            _                   (.run change-log-iterator list-visistor runtime-env)
            change-set          (first (filter #(= id (.getId %))(.getSeenChangeSets list-visistor)))
            sql-generator-factory (SqlGeneratorFactory/getInstance)]
        (reduce (fn [acc data]
                  ;; merge all changes in one change set into one single :forward and :rollback
                  (merge-with (fn [x y]
                                (str x "\n" y)) acc data))
                {}
                (map #(change->sql % sql-generator-factory database) (.getChanges change-set)))))))
