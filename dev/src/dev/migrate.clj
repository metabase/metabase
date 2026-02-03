(ns dev.migrate
  (:gen-class)
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]
   [toucan2.honeysql2 :as t2.honeysql])
  (:import
   (liquibase Contexts LabelExpression Liquibase RuntimeEnvironment)
   (liquibase.change Change)
   (liquibase.changelog ChangeLogIterator ChangeSet DatabaseChangeLog)
   (liquibase.changelog.filter ChangeSetFilter)
   (liquibase.changelog.visitor ListVisitor)
   (liquibase.database Database)
   (liquibase.database.core H2Database MariaDBDatabase MySQLDatabase PostgresDatabase)
   (liquibase.exception RollbackImpossibleException)
   (liquibase.sql Sql)
   (liquibase.sqlgenerator SqlGeneratorFactory)
   (liquibase.statement SqlStatement)))

(set! *warn-on-reflection* true)

(def ^:private databasechangelog-name
  (if (#{:mysql} (mdb/db-type))
    :DATABASECHANGELOG
    :databasechangelog))

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
   (println (format "Migrated %s. Latest migration: %s" (name direction) (latest-migration)))))

(defn- rollback-n-migrations!
  [^Integer n]
  (with-open [conn (.getConnection (mdb/data-source))]
    (liquibase/with-liquibase [^Liquibase liquibase conn]
      (liquibase/with-scope-locked liquibase
        (.rollback liquibase n "")))))

(defn- migration-since
  [id]
  (->> (t2/query-one {:select [[:%count.* :count]]
                      :from   [databasechangelog-name]
                      :where  [:> :orderexecuted {:select   [:orderexecuted]
                                                  :from     [databasechangelog-name]
                                                  :where    [:like :id (format "%s%%" id)]
                                                  :order-by [[:orderexecuted :desc]]
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

(defn- last-deployment
  []
  (binding [t2.honeysql/*options* (assoc t2.honeysql/*options*
                                         :quoted false)]
    (if (= 1 (:count (t2/query-one {:select [[[:count [:distinct :deployment_id]] :count]]
                                    :from   [databasechangelog-name]
                                    :limit  1})))
      0 ;; don't rollback if there was just one deployment of everything
      (:count (t2/query-one {:select [[:%count.* :count]]
                             :from   [databasechangelog-name]
                             :where  [:= :deployment_id {:select   [:deployment_id]
                                                         :from     [databasechangelog-name]
                                                         :order-by [[:orderexecuted :desc]]
                                                         :limit    1}]})))))

(defn reset-checksums!
  []
  (with-open [conn (.getConnection ^javax.sql.DataSource (mdb/data-source))]
    (let [changelog-table (keyword (liquibase/changelog-table-name (mdb/data-source)))]
      (t2/query {:update changelog-table
                 :set    {:md5sum nil}}))
    (.setAutoCommit conn false)
    (liquibase/with-liquibase [liquibase conn]
      (liquibase/with-scope-locked liquibase
        (.changeLogSync liquibase (Contexts.) (LabelExpression.)))))
  (println "Reset checksums"))

(mu/defn rollback!
  "Rollback helper, can take a number of migrations to rollback or a specific migration ID(inclusive) or last-deployment.

    ;; Rollback 2 migrations:
    (rollback! :count 2)

    ;; Rollback last migration run:
    ;; (rollback! :last-deployment)

    ;; rollback to \"v50.2024-03-18T16:00:00\" (inclusive)
    (rollback! :id \"v50.2024-03-18T16:00:00\")"
  ([k :- [:enum :last-deployment "last-deployment"]]
   (let [n (case (keyword k)
             :last-deployment (last-deployment))]
     (rollback-n-migrations! n)
     #_{:clj-kondo/ignore [:discouraged-var]}
     (println (format "Rollbacked %d migrations. Latest migration: %s" n (latest-migration)))))

  ([k :- [:enum :id :count "id" "count"]
    target]
   (let [n (case (keyword k)
             :id               (migration-since target)
             :count            (maybe-parse-long target))]
     (rollback-n-migrations! n)
     #_{:clj-kondo/ignore [:discouraged-var]}
     (println (format "Rollbacked %d migrations. Latest migration: %s" n (latest-migration))))))

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
    clojure -M:migrate rollback last-deployment   ;; rollback the last deployment
    clojure -M:migrate status                     ;; print the latest migration id
    clojure -M:migrate reset-checksums.           ;; sets the checksums to what they would be if migrated from the current changelog"

  [& args]
  (let [[cmd & migration-args] args]
    (case cmd
      "rollback"
      (apply rollback! migration-args)

      "up"
      (apply migrate! migration-args)

      "status"
      (migration-status)

      "reset-checksums"
      (reset-checksums!)

      (throw (ex-info "Invalid command" {:command cmd
                                         :args    args})))))

(defn- stmts-to-sql
  [stmts sql-generator-factory database]
  (str/join "\n" (for [stmt stmts
                       sql (.generateSql ^SqlGeneratorFactory sql-generator-factory ^SqlStatement stmt ^Database database)]
                   (.toString ^Sql sql))))

(defn- change->sql
  [^Change change sql-generator-factory database]
  {:forward  (stmts-to-sql (.generateStatements change database) sql-generator-factory database)
   :rollback (try (stmts-to-sql (.generateRollbackStatements change database) sql-generator-factory database)
                  (catch RollbackImpossibleException e
                    (str "Rollback impossible " e)))})

(defn- liquibase-database [db-type]
  (case db-type
    :postgres (PostgresDatabase.)
    :mysql    (MySQLDatabase.)
    :mariadb  (MariaDBDatabase.)
    :h2       (H2Database.)))

(mu/defn migration-sql-by-id
  "Get the sql statements for a specific migration ID and DB type. If no DB type is provided, it will use the current
   application DB type.
    (migration-sql-by-id \"v51.2024-06-12T18:53:02\" :postgres)
    ;; =>
      {:forward \"DROP INDEX public.idx_user_id_device_id;\",
       :rollback \"CREATE INDEX idx_user_id_device_id ON public.login_history(session_id, device_id);\"}"
  ([id]
   (migration-sql-by-id id (mdb/db-type)))
  ([id db-type :- [:enum :postgres :mysql :mariadb :h2]]
   (t2/with-connection [conn]
     (liquibase/with-liquibase [^Liquibase liquibase conn]
       (let [database              (liquibase-database db-type)
             change-log-iterator   (ChangeLogIterator. ^DatabaseChangeLog (.getDatabaseChangeLog liquibase)
                                                       ^"[Lliquibase.changelog.filter.ChangeSetFilter;" (into-array ChangeSetFilter []))
             list-visitor          (ListVisitor.)
             runtime-env           (RuntimeEnvironment. database (Contexts.) nil)
             _                     (.run change-log-iterator list-visitor runtime-env)
             ^ChangeSet change-set (first (filter #(= id (.getId ^ChangeSet %)) (.getSeenChangeSets list-visitor)))
             sql-generator-factory (SqlGeneratorFactory/getInstance)]
         (reduce (fn [acc data]
                  ;; merge all changes in one change set into one single :forward and :rollback
                   (merge-with (fn [x y]
                                 (str x "\n" y)) acc data))
                 {}
                 (map #(change->sql % sql-generator-factory database) (.getChanges change-set))))))))

(defn known-changesets
  "Gets a list of all changesets applicable to current db"
  []
  (t2/with-connection [conn]
    (liquibase/with-liquibase [^Liquibase liquibase conn]
      (let [database            (liquibase-database (mdb/db-type))
            change-log-iterator (ChangeLogIterator. ^DatabaseChangeLog (.getDatabaseChangeLog liquibase)
                                                    ^"[Lliquibase.changelog.filter.ChangeSetFilter;" (into-array ChangeSetFilter []))
            list-visitor        (ListVisitor.)
            runtime-env         (RuntimeEnvironment. database (Contexts.) nil)]
        (.run change-log-iterator list-visitor runtime-env)
        (->> (.getSeenChangeSets list-visitor)
             (map (fn [^ChangeSet c]
                    {:id          (.getId c)
                     :author      (.getAuthor c)
                     :filename    (.getFilePath c)
                     :description (.getDescription c)
                     :changes     (vec (.getChanges c))
                     :comments    (.getComments c)})))))))

(defn orphaned-changesets
  "List migrations that are applied to the database but not present in the current changelog.

  They either have different id or are not present at all."
  []
  (let [applied      (->> (t2/query {:from   [(keyword (liquibase/changelog-table-name (mdb/data-source)))]
                                     :select [:id :comments :author]
                                     ;; ignore ancient history
                                     :where  [:< [:age :dateexecuted] [:raw "INTERVAL '2 year'"]]})
                          (map t2/current))
        known        (mapv #(select-keys % [:id :comments :author]) (known-changesets))
        by-id        (group-by :id known)
        by-comments  (group-by :comments known)
        ;; we cannot use `set/diff` here because long `comments` can be truncated in the db
        orphans      (remove #(contains? by-id (:id %)) applied)
        ;; obviously prev comment is valid here as well but we work with what we have :)
        mismatches   (for [c     orphans
                           :let  [known-as (get by-comments (:comments c))]
                           :when known-as]
                       (assoc c :knownas (:id known-as)))
        mismatch-ids (set (map :id mismatches))
        unknown      (vec (remove #(contains? mismatch-ids (:id %)) orphans))]
    {:mismatches (sort-by :id mismatches) ; identical comments, but different ids
     :unknown    (sort-by :id unknown)    ; those are not present in current branch
     :total      (+ (count mismatches) (count unknown))}))

(comment
  (rollback! :count 1)
  (rollback! :id "v51.2024-08-30T08:00:03")
  (migration-sql-by-id "v51.2024-09-05T08:00:04" :postgres)
  (migrate!))
