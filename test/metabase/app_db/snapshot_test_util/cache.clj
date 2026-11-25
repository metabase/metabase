(ns metabase.app-db.snapshot-test-util.cache
  "Snapshots shared within one test run. Each test gets a separate database."
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [mb.hawk.hooks :as hooks]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.generate :as generate]
   [methodical.core :as methodical])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(defonce ^:private run-cache (atom nil))

(defn clear!
  "Delete the current run's snapshot files and clear its cache."
  []
  (locking run-cache
    (when-let [directory (:directory @run-cache)]
      (fs/delete-tree directory))
    (reset! run-cache nil)))

(methodical/defmethod hooks/before-run ::snapshots
  "Start each test run without cached snapshots."
  [_options]
  (clear!))

(methodical/defmethod hooks/after-run ::snapshots
  "Delete cached snapshots after a successful or failed test run."
  [_options]
  (clear!))

(defn- check-request [flavor through-id]
  (when-not (snapshot/flavors flavor)
    (throw (ex-info "Unsupported snapshot flavor" {:flavor flavor})))
  (when-not (and (string? through-id) (not (str/blank? through-id)))
    (throw (ex-info "A migration boundary changeset ID is required" {:through-changeset-id through-id})))
  (when-not (snapshot/matches-environment?)
    (throw (ex-info "Cached snapshots require encryption to be disabled" {}))))

(defn- validate-snapshot! [flavor through-id sql]
  (generate/do-with-empty-db!
   flavor
   (fn [conn _server]
     (snapshot/load-sql! conn flavor sql)
     (liquibase/with-liquibase [lb conn]
       (.validate lb))
     (let [boundary (jdbc/query {:connection conn}
                                ["SELECT c.id FROM DATABASECHANGELOG c
                                 JOIN DATABASECHANGELOG_VERSION v ON c.deployment_id = v.deployment_id
                                 WHERE c.id = ? AND v.ran_migrations = TRUE" through-id])]
       (when-not (seq boundary)
         (throw (ex-info "Snapshot does not record its migration boundary version"
                         {:through-changeset-id through-id})))))))

(defn- cache-directory! []
  (or (:directory @run-cache)
      (let [directory (fs/create-temp-dir {:prefix "metabase-app-db-snapshots-"})]
        (reset! run-cache {:directory directory})
        directory)))

(defn- generate-entry! [flavor through-id]
  (let [{:keys [content]} (generate/dump-boundary! flavor through-id)]
    (validate-snapshot! flavor through-id content)
    (let [file (File/createTempFile (str (name flavor) "-") ".sql" (fs/file (cache-directory!)))]
      (try
        (spit file content)
        file
        (catch Throwable e
          (io/delete-file file true)
          (throw e))))))

(defn ensure-snapshot!
  "Return a SQL file through the inclusive changeset ID, shared until this test run ends.
  Generate and validate it on first use. Non-H2 generation requires Docker."
  ^File [flavor through-id]
  (check-request flavor through-id)
  (locking run-cache
    (or (get-in @run-cache [:files [flavor through-id]])
        (let [file (generate-entry! flavor through-id)]
          (swap! run-cache assoc-in [:files [flavor through-id]] file)
          file))))

(defn do-with-snapshot!
  "Call `f` with a separate database restored through the inclusive changeset ID, then close and remove it."
  [{:keys [flavor through-changeset-id]} f]
  (let [file    (ensure-snapshot! flavor through-changeset-id)
        db-type (if (#{:mariadb :mariadb-legacy-timestamp} flavor) :mysql flavor)]
    (impl/with-temp-empty-app-db [conn db-type]
      (when-not (= flavor (snapshot/flavor conn db-type))
        (throw (ex-info "Test database does not match the snapshot flavor" {:flavor flavor})))
      (snapshot/load-sql! conn flavor (slurp file))
      (f conn))))

(defmacro with-snapshot
  "Bind a connection using `:flavor` and inclusive `:through-changeset-id`."
  {:style/indent 1}
  [[conn options] & body]
  `(do-with-snapshot! ~options (fn [~conn] ~@body)))
