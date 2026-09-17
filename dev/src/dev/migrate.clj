(ns dev.migrate
  (:gen-class)
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
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
  "Run migrations for the Metabase application database. Possible directions are `:up` (default), `:force`, `:print`
  and `:release-locks` -- what `java -jar metabase.jar migrate <direction>` does.

  There is deliberately no `:down` here: the release `migrate down` steps back one recorded Metabase *major*, which
  means nothing for development deployments (they all record [[liquibase/dev-version]]). Roll back by deployment with
  [[rollback!]] instead."
  ([]
   (migrate! :up))
  ([direction]
   (when (#{:down :down-force "down" "down-force"} direction)
     (throw (ex-info (str "migrate! does not roll back. Use (rollback! :last-deployment) to undo the last migrate! run, "
                          "or (rollback! :deployment <id>) to roll back everything after a deployment.")
                     {:direction direction})))
   (mdb/migrate! (mdb/data-source) direction)
   ;; dev migration CLI; status goes to stdout for the human running it
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
                      :where  [:> :orderexecuted ^:allow-subquery
                               {:select   [:orderexecuted]
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

(defn- rollback-to-deployment!
  "Roll back everything that ran after `boundary-deployment-id` (nil: nothing to do), in its own transaction, keeping
  `databasechangelog_version` and the legacy-version-tracking marker in step. Returns the boundary deployment id."
  [boundary-deployment-id]
  (if (nil? boundary-deployment-id)
    ;; dev migration CLI; status goes to stdout for the human running it
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println "No earlier deployment to roll back to; nothing to do.")
    (with-open [conn (.getConnection ^javax.sql.DataSource (mdb/data-source))]
      (.setAutoCommit conn false)
      (liquibase/with-liquibase [liquibase conn]
        (try
          (liquibase/rollback-to-deployment! conn liquibase boundary-deployment-id)
          (.commit conn)
          (catch Throwable e
            (.rollback conn)
            (throw e))))
      ;; dev migration CLI; status goes to stdout for the human running it
      #_{:clj-kondo/ignore [:discouraged-var]}
      (println (format "Rolled back to deployment %s. Latest migration: %s" boundary-deployment-id (latest-migration)))))
  boundary-deployment-id)

(mu/defn rollback!
  "Rollback helper. Deployment-based rollbacks are the ones to reach for in development -- every `migrate!` run is
  its own Liquibase `deployment_id`, whatever Metabase version (real or [[liquibase/dev-version]]) it recorded:

    ;; Roll back the last migration run (everything after the second-newest deployment):
    (rollback! :last-deployment)

    ;; Roll back everything that ran after a given deployment_id (see `SELECT * FROM databasechangelog_version`):
    (rollback! :deployment \"9673292410\")

  Both keep `databasechangelog_version` and the legacy-version-tracking marker in step, exactly like the release
  `migrate down` does for majors.

    ;; Raw Liquibase rollbacks by changeset position -- they do NOT update `databasechangelog_version` or remove a
    ;; deployment's marker row, so a later `migrate! :down` may misjudge its boundary; partial-rollback use only:
    (rollback! :count 2)
    (rollback! :id \"v50.2024-03-18T16:00:00\")   ; inclusive"
  ([_k :- [:enum :last-deployment "last-deployment"]]
   (rollback-to-deployment!
    (with-open [conn (.getConnection ^javax.sql.DataSource (mdb/data-source))]
      (liquibase/with-liquibase [liquibase conn]
        (liquibase/previous-deployment-id conn (.getDatabase liquibase))))))

  ([k      :- [:enum :id :count :deployment "id" "count" "deployment"]
    target :- [:or :int :string]]
   (if (= :deployment (keyword k))
     (rollback-to-deployment! (str target))
     (let [n (case (keyword k)
               :id               (migration-since target)
               :count            (maybe-parse-long target))]
       (rollback-n-migrations! n)
       ;; dev migration CLI; status goes to stdout for the human running it
       #_{:clj-kondo/ignore [:discouraged-var]}
       (println (format "Rollbacked %d migrations. Latest migration: %s" n (latest-migration)))))))

(defn migration-status
  "Print the latest migration ID."
  []
  ;; dev migration CLI; status goes to stdout for the human running it
  #_{:clj-kondo/ignore [:discouraged-var]}
  (println "Current migration:" (latest-migration)))

(defn -main
  "Migrations helpers

  Usage:
    clojure -M:migrate up                         ;; migrate up to the latest
    clojure -M:migrate rollback count 2           ;; rollback 2 migrations
    clojure -M:migrate rollback id \"v40.00.001\" ;; rollback to a specific migration with id
    clojure -M:migrate rollback last-deployment   ;; rollback the last deployment (last migrate run)
    clojure -M:migrate rollback deployment <id>   ;; rollback everything after that deployment_id
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
  ([id :- :string]
   (migration-sql-by-id id (mdb/db-type)))
  ([id      :- :string
    db-type :- [:enum :postgres :mysql :mariadb :h2]]
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
