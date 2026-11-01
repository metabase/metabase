(ns metabase.test.liquibase
  "Contains utilities to improve Liquibase interactions within tests or make them faster."
  (:require
   [metabase.app-db.liquibase :as liquibase]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config])
  (:import
   (java.sql Connection)
   (java.util ArrayList)
   (liquibase Liquibase)
   (liquibase.changelog ChangeSet DatabaseChangeLog)
   (liquibase.database Database)
   (liquibase.resource ClassLoaderResourceAccessor)))

(set! *warn-on-reflection* true)

(defonce
  ^{:private true
    :doc "Cache for parsed DatabaseChangeLog instances. Keyed by `[changelog-filename database-short-name]`."}
  changelog-cache (atom {}))

(defn- snapshot-changelog-mutable-fields
  "Extract those fields for each [[ChangeSet]] that must be re-applied because Liquibase overwrites them, so they have
  to be restored when a cached ChangeLog is given out."
  [^DatabaseChangeLog change-log]
  (mapv (fn [^ChangeSet change-set]
          {:change-set    change-set
           ;; `ChangeLogIterator` rewrites this when rolling back
           :file-path     (.getFilePath change-set)
           ;; flipped at runtime by [[migrations-sql]] and [[force-migrate-up-if-needed!]]
           :ignore?       (.isIgnore change-set)
           :fail-on-error (.getFailOnError change-set)})
        (.getChangeSets change-log)))

(defn- restore-changelog-mutable-fields!
  "Put the changesets of a cached changelog back into the state parsing left them in.

  A cached changelog is shared by every `Liquibase` instance built against the same database type, including ones
  pointed at different databases. Liquibase writes the results of a run back onto the changesets themselves, so we must restore the changelog to a pristine condition before handing it out to the next consumer. The following fields need to be taken care of:

  - `validationFailed` - `ValidatingVisitor` sets it to `true` and the migration run is later considered to be run.
  - `filePath` is rewritten from the ran-changeset by the `List<RanChangeSet>` `ChangeLogIterator` constructor.
  - `generatedSql` accumulates: `ChangeSet.execute` appends every statement it generates. Left alone it grows without
    bound for the life of the process.
  - `storedCheckSum`, `storedFilePath`, `deploymentId`, `execType`, `rollbackExecType`, `errorMsg` and the operation
    timestamps are per-database bookkeeping.
  - Content checksum is cleared just in case."
  [fields-snapshot]
  (doseq [{:keys [^ChangeSet change-set file-path ignore? fail-on-error]} fields-snapshot]
    (doto change-set
      (.setFilePath file-path)
      (.setIgnore (boolean ignore?))
      (.setFailOnError fail-on-error)
      (.setValidationFailed false)
      (.clearCheckSum)
      (.setStoredCheckSum nil)
      (.setStoredFilePath nil)
      (.setDeploymentId nil)
      (.setExecType nil)
      (.setRollbackExecType nil)
      (.setErrorMsg nil)
      (.setGeneratedSql (ArrayList.))
      (.setOperationStartTime nil)
      (.setOperationStopTime nil))))

(defn- get-cached-changelog!
  "For the given `filename` and `database`, return a possibly cached [[DatabaseChangeLog]], memoizing the result. In dev
  and test enviroments, this caching cuts down on redundant reparsing of the changelog.

  The cache key includes the database short name because parsing is database-aware - the parsed changelog against two
  different DBMS types may be different."
  ^DatabaseChangeLog [^String filename ^Database database]
  (let [cache-key [filename (.getShortName database)]]
    (if-let [{:keys [changelog fields-snapshot]} (get @changelog-cache cache-key)]
      (do (restore-changelog-mutable-fields! fields-snapshot)
          changelog)
      ;; No locking, we don't mind a few racy redundant computations.
      (let [changelog (.getDatabaseChangeLog (liquibase/make-liquibase-from-filename filename database))]
        (swap! changelog-cache assoc cache-key {:changelog changelog
                                                :fields-snapshot (snapshot-changelog-mutable-fields changelog)})
        changelog))))

(defn- cached-changelog-liquibase! ^Liquibase [^Connection conn ^Database database]
  (let [filename (liquibase/decide-liquibase-file conn database)]
    (Liquibase. (get-cached-changelog! filename database)
                (ClassLoaderResourceAccessor. (classloader/the-classloader))
                database)))

;; Only use cached changelog during tests - when it's guaranteed that the migration files don't change, and that we
;; don't touch the production code in any way.
(when config/is-test?
  (.bindRoot #'liquibase/liquibase cached-changelog-liquibase!))
