(ns metabase.app-db.test-util
  (:require
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.liquibase.versions :as versions]
   [metabase.driver.test-util :as driver.tu]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util.random :as u.random]
   [metabase.util.yaml :as u.yaml]
   [potemkin :as p]
   [pretty.core :as pretty]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(p/deftype+ ClojureJDBCSpecDataSource [jdbc-spec]
  pretty/PrettyPrintable
  (pretty [_]
    (list `->ClojureJDBCSpecDataSource jdbc-spec))

  javax.sql.DataSource
  (getConnection [_]
    ;; this shim's job is adapting a raw jdbc spec into a DataSource; it opens the connection itself
    #_{:clj-kondo/ignore [:discouraged-var]}
    (jdbc/get-connection jdbc-spec))

  (getConnection [_ _user _password]
    (throw (UnsupportedOperationException. "Use (.getConnection this) instead."))))

(alter-meta!
 #'->ClojureJDBCSpecDataSource
 assoc
 :arglists '(^javax.sql.DataSource [jdbc-spec])
 :deprecated :true
 :doc "Return a [[javax.sql.DataSource]] for a [[clojure.java.jdbc]] spec. DEPRECATED -- this is only provided for
 backwards compatibility without having to rewrite a bunch of tests. Prefer
 [[metabase.app-db.data-source/broken-out-details->DataSource]] or
 [[metabase.app-db.data-source/raw-connection-string->DataSource]] instead.")

(deftest jdbc-spec-test
  (let [data-source (->ClojureJDBCSpecDataSource
                     {:subprotocol "h2"
                      :subname     (format "mem:%s" (u.random/random-name))
                      :classname   "org.h2.Driver"})]
    (with-open [conn (.getConnection data-source)]
      (is (= [{:one 1}]
             (jdbc/query {:connection conn} "SELECT 1 AS one;"))))))

(defn do-with-app-db-timezone-id!
  "Sets the app DB time zone to `tz` and runs `thunk`."
  [tz thunk]
  (driver.tu/wrap-notify-all-databases-updated!
   (if (= (mdb/db-type) :h2)
     (test.tz/do-with-system-timezone-id! tz thunk)
     ;; otherwise if db-type is postgres or mysql
     (let [initial-tz (val (first (t2/query-one (case (mdb/db-type)
                                                  :postgres "SELECT current_setting('TIMEZONE')"
                                                  :mysql "SELECT @@global.time_zone"))))
           set-tz! (fn [x]
                     (t2/query (case (mdb/db-type)
                                 :postgres (format "SET TIME ZONE '%s';" x)
                                 :mysql (format "SET @@global.time_zone = '%s';" x))))]
       (set-tz! tz)
       (try (thunk)
            (finally
              (set-tz! initial-tz)))))))

(defmacro with-app-db-timezone-id!
  "Execute `body` with the system time zone of the app db temporarily changed to the time zone named by `timezone-id`."
  [timezone-id & body]
  `(do-with-app-db-timezone-id! ~timezone-id (fn [] ~@body)))

(defn liquibase-file->included-ids
  "Read a liquibase migration file and returns all the migration id that is applied to `db-type`.
  Ids are orderer in the order it's defined in migration file."
  [file-path db-type conn]
  (let [content (u.yaml/from-file (io/resource file-path))
        lb-type (if (= "MariaDB" (.getDatabaseProductName (.getMetaData ^java.sql.Connection conn)))
                  :mariadb
                  db-type)]
    (->> (:databaseChangeLog content)
         ;; if the changelog has filter by dbms, remove the ones that doens't apply for the current lb-type
         (remove (fn [{{:keys [dbms]} :changeSet}] (and (not (str/blank? dbms))
                                                        (not (str/includes? dbms (name lb-type))))))
         ;; remove ignored changeSets
         (remove #(get-in % [:changeSet :ignore]))
         (map #(str (get-in % [:changeSet :id])))
         (remove str/blank?))))

(defn all-migration-files
  "Returns a list of existing migration files."
  [include-legacy?]
  (into (if include-legacy?
          ["liquibase_legacy_migrations.yaml" "migrations/001_update_migrations.yaml"]
          ["migrations/001_update_migrations.yaml"])
        (concat
         ;; Per-release migration files (v56-v59 pattern)
         (filter io/resource (for [n (range 56 100)]
                               (format "migrations/%03d_update_migrations.yaml" n)))
         ;; Directory-based migration files (v60+ pattern)
         (let [migrations-dir (io/resource "migrations")]
           (when migrations-dir
             (->> (io/file migrations-dir)
                  file-seq
                  (filter (fn [^java.io.File f]
                            (and (.isFile f)
                                 (re-matches #".*\d{3}/\d{8}_.+\.yaml$" (str f)))))
                  sort
                  (map (fn [^java.io.File f]
                         (str "migrations/" (.getName (.getParentFile f)) "/" (.getName f))))))))))

(defn all-liquibase-ids
  "Returns a set of all changeset IDs from all migration files."
  [include-legacy? driver conn]
  (apply concat (map #(liquibase-file->included-ids % driver conn) (all-migration-files include-legacy?))))

;;; ------------------------------------------ fabricated deployment histories ------------------------------------

(defn age-changelog-rows!
  "Rewind every existing `databasechangelog` row's `dateexecuted` by `minutes` (default 1); their relative order is
  preserved by the `orderexecuted` tiebreak. Required before layering fabricated rows or a second migration run on top
  of rows Liquibase just wrote: MySQL's second-precision DATEEXECUTED **rounds** sub-second JDBC timestamps, so a row
  Liquibase wrote at xx.5s is stored one second in the FUTURE, and a row written shortly after it (CURRENT_TIMESTAMP
  truncates) can sort at-or-before it. Real deployments are separated by real wall-clock time; this restores that
  separation for back-to-back test writes.

  The rewind is computed ON THE SERVER (`CURRENT_TIMESTAMP - INTERVAL '<n>' MINUTE`, valid on H2/Postgres/MySQL): a
  client-side `java.sql.Timestamp` parameter is rendered in the JVM's zone while Liquibase's rows and
  `CURRENT_TIMESTAMP` land in the server's frame, so on a non-UTC dev machine against a UTC MySQL the aged rows would
  jump hours into the future instead."
  ([spec changelog-table]
   (age-changelog-rows! spec changelog-table 1))
  ([spec changelog-table minutes]
   (jdbc/execute! spec [(format "UPDATE %s SET dateexecuted = CURRENT_TIMESTAMP - INTERVAL '%d' MINUTE"
                                changelog-table (long minutes))])))

(defn- insert-changelog-row!
  [conn changelog-table {:keys [id author filename exectype] :or {author "test", filename "synthetic.yaml", exectype "EXECUTED"}}
   deployment-id minutes-ago]
  (jdbc/execute! {:connection conn}
                 [(format (str "INSERT INTO %s (id, author, filename, dateexecuted, orderexecuted, exectype, deployment_id) "
                               "SELECT ?, ?, ?, CURRENT_TIMESTAMP - INTERVAL '%d' MINUTE, COALESCE(MAX(orderexecuted), 0) + 1, ?, ? FROM %s")
                          changelog-table (long minutes-ago) changelog-table)
                  id author filename exectype deployment-id]))

(defn fabricate-history!
  "Insert a fabricated deployment history into the application database on `conn`, oldest entry first, as the newest
  history of the changelog (rows already there are first aged to before the oldest entry). Each entry is

    {:deployment  \"d64\"                    ; its deployment_id
     :ran         \"x.64.0\"                 ; the version recorded as having run it (optional)
     :booted      [\"x.65.0\"]               ; versions recorded as having booted against it (optional)
     :changesets  [\"c64\" {:id \"v64.abc\", :author \"t\", :filename \"f.yaml\", :exectype \"RERAN\"}] ; its changelog rows
     :minutes-ago 20}                       ; dateexecuted of those rows; defaults to ten minutes per step

  A changeset given as a string is its id with the defaults `test`/`synthetic.yaml`/`EXECUTED`. The version table must
  exist (see [[versions/ensure-version-tracking!]])."
  [conn changelog-table entries]
  (let [n           (count entries)
        minutes-ago (fn [i {:keys [minutes-ago]}] (or minutes-ago (* 10 (- n i))))
        oldest      (apply max 1 (map-indexed minutes-ago entries))]
    (age-changelog-rows! {:connection conn} changelog-table (inc oldest))
    (doseq [[i {:keys [deployment ran booted changesets] :as entry}] (map-indexed vector entries)
            :let [ago (minutes-ago i entry)]]
      (doseq [cs changesets]
        (insert-changelog-row! conn changelog-table (if (string? cs) {:id cs} cs) deployment ago))
      (when ran
        (versions/record-deployment-version! conn deployment ran true))
      (doseq [version booted]
        (versions/record-deployment-version! conn deployment version false)))))

(defn split-legacy-majors-into-deployments!
  "Give every legacy `vNN.` major in the changelog its own deployment (`mjr0NN`) with an `x.NN.0.0` ran-version row, as
  if the database had been upgraded release by release: a single update run covers many majors but records only one
  deployment and one version, while the deployment-based rollback needs a boundary at every major. Version-less ids
  keep their deployment. Version rows of deployments left without any changelog row are removed. Idempotent."
  [conn changelog-table]
  (let [ids      (map :id (jdbc/query {:connection conn} [(format "SELECT id FROM %s" changelog-table)]))
        major-of (fn [id] (some-> (re-find #"^v(\d+)\." id) second parse-long))]
    (doseq [[major block-ids] (sort-by key (group-by major-of (filter major-of ids)))]
      (let [deployment-id (format "mjr%03d" major)]
        (jdbc/execute! {:connection conn}
                       (into [(format "UPDATE %s SET deployment_id = ? WHERE id IN (%s)"
                                      changelog-table
                                      (str/join ", " (repeat (count block-ids) "?")))
                              deployment-id]
                             block-ids))
        (versions/record-deployment-version! conn deployment-id (format "x.%d.0.0" major) true)))
    (jdbc/execute! {:connection conn}
                   [(format "DELETE FROM %s WHERE deployment_id NOT IN (SELECT DISTINCT deployment_id FROM %s WHERE deployment_id IS NOT NULL)"
                            versions/databasechangelog-versions-table
                            changelog-table)])))
