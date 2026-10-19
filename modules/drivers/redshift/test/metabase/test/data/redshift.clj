(ns ^:mb/driver-tests metabase.test.data.redshift
  "We use a single redshift database for all test runs in CI, so to isolate test runs and test databases we:
   1. Use a unique session schema for the test run (unique-session-schema), and only sync tables in that schema.
   2. Prefix table names with the database name, and for each database we only sync tables with the matching prefix.

   e.g.
   H2 Tests                                          | Redshift Tests
   --------------------------------------------------+------------------------------------------------
   `test-data`            PUBLIC.VENUES.ID           | <unique-session-schema>.test_data_venues.id
   `test-data`            PUBLIC.CHECKINS.USER_ID    | <unique-session-schema>.test_data_checkins.user_id
   `sad-toucan-incidents` PUBLIC.INCIDENTS.TIMESTAMP | <unique-session-schema>.sad_toucan_incidents.timestamp"
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [com.climate.claypoole :as cp]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.redshift]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.test-util.unique-prefix :as sql.tu.unique-prefix]
   [metabase.test :as mt]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; need to load this so we can properly override the implementation of `describe-database` below
(comment metabase.driver.redshift/keep-me)

(defmethod driver/database-supports? [:redshift :test/time-type]
  [_driver _feature _database]
  false)

;; we don't need to add test extensions here because redshift derives from Postgres and thus already has test
;; extensions

;; Time, UUID types aren't supported by redshift
(doseq [[base-type database-type] {:type/BigInteger     "BIGINT"
                                   :type/Boolean        "BOOL"
                                   :type/Date           "DATE"
                                   :type/DateTime       "TIMESTAMP"
                                   :type/DateTimeWithTZ "TIMESTAMPTZ"
                                   :type/Decimal        "DECIMAL"
                                   :type/Float          "FLOAT8"
                                   :type/Integer        "INTEGER"
                                   ;; Use VARCHAR because TEXT in Redshift is VARCHAR(256)
                                   ;; https://docs.aws.amazon.com/redshift/latest/dg/r_Character_types.html#r_Character_types-varchar-or-character-varying
                                   ;; But don't use VARCHAR(MAX) either because of performance impact
                                   ;; https://docs.aws.amazon.com/redshift/latest/dg/c_best-practices-smallest-column-size.html
                                   :type/Text           "VARCHAR(1024)"}]
  (defmethod sql.tx/field-base-type->sql-type [:redshift base-type] [_ _] database-type))

;; If someone tries to run Time column tests with Redshift give them a heads up that Redshift does not support it
(defmethod sql.tx/field-base-type->sql-type [:redshift :type/Time]
  [_ _]
  (throw (UnsupportedOperationException. "Redshift does not have a TIME data type.")))

(defn unique-session-schema []
  (sql.tu.unique-prefix/unique-prefix "schema"))

;;; `MB_REDSHIFT_TEST_HOSTS`
;;;
;;; We've had lots of problems with Redshift timing out because of too much CPU load on our single cluster in the past;
;;; instead of continuing to increase the size of the cluster (which doesn't seem to help much) we're switching to a
;;; handful of smaller clusters, and picking one randomly; there is nothing shared between test runs and no reason they
;;; all need to be done on a single cluster anyway. Other than the `:host` these are all configured identically with the
;;; same user, password, and database name.

(defonce ^:private hosts
  (delay
    (when-let [hosts (not-empty (tx/db-test-env-var :redshift :hosts))]
      (str/split hosts #","))))

(defn- random-host
  "Pick a random host to test against from `MB_REDSHIFT_TEST_HOSTS` if it's set; otherwise fall back to the host in
  `MB_REDSHIFT_TEST_HOST`."
  []
  (u/prog1 (if (seq @hosts)
             (rand-nth @hosts)
             (tx/db-test-env-var-or-throw :redshift :host))
    ;; using println on purpose here for purposes of debugging CI, we can remove in the future when we're happy that
    ;; multiple hosts works as expected
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println "Using Redshift host" (pr-str (first (str/split <> #"\."))))))

(defonce ^:private host (delay (random-host)))

(def db-connection-details
  (delay {:host                    @host
          :port                    (parse-long (tx/db-test-env-var :redshift :port "5439"))
          :db                      (tx/db-test-env-var :redshift :db "testdb")
          :user                    (tx/db-test-env-var :redshift :user "metabase_ci")
          :password                (tx/db-test-env-var-or-throw :redshift :password)
          :schema-filters-type     "inclusion"
          :schema-filters-patterns (str "spectrum," (unique-session-schema))}))

(def db-routing-connection-details
  (delay
    (assoc @db-connection-details :db (tx/db-test-env-var :redshift :db-routing "dev"))))

(defmethod tx/dbdef->connection-details :redshift
  [& _]
  (if tx/*use-routing-details*
    @db-routing-connection-details
    @db-connection-details))

(defmethod sql.tx/create-db-sql :redshift [& _] nil)
(defmethod sql.tx/drop-db-if-exists-sql :redshift [& _] nil)

(defmethod sql.tx/pk-sql-type :redshift [_] "INTEGER IDENTITY(1,1)")

(defmethod sql.tx/session-schema :redshift [_driver] (unique-session-schema))

(defmethod sql.tx/qualified-name-components :redshift [& args]
  (apply tx/single-db-qualified-name-components (unique-session-schema) args))

;; don't use the Postgres implementation of `drop-db-ddl-statements` because it adds an extra statement to kill all
;; open connections to that DB, which doesn't work with Redshift
(defmethod ddl/drop-db-ddl-statements :redshift
  [& args]
  (apply (get-method ddl/drop-db-ddl-statements :sql-jdbc/test-extensions) args))

(defmethod sql.tx/drop-table-if-exists-sql :redshift
  [& args]
  (apply sql.tx/drop-table-if-exists-cascade-sql args))

;;; Create + destroy the schema used for this test session

(defn- reducible-result-set [^java.sql.ResultSet rset]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (with-open [rset rset]
        (loop [res init]
          (if (.next rset)
            (recur (rf res rset))
            res))))))

(defn- fetch-schemas [^java.sql.Connection conn]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (reduce ((map (fn [^java.sql.ResultSet rset]
                      (.getString rset "TABLE_SCHEM"))) rf)
              init
              (reducible-result-set (.. conn getMetaData getSchemas))))))

(defn- classify-cache-schemas
  "Classifies the persistence cache schemas. Returns a map with where each value is a (possibly empty) sequence of
  schemas:

  {:old-style-cache    schemas without a `cache_info` table
   :recent             schemas with a `cache_info` table and are recently created
   :expired            `cache_info` table and created [[hours-before-expired-threshold]] ago
   :lacking-created-at should never happen, but if they lack an entry for `created-at`
   :unknown-error      if an error was thrown while classifying the schema}"
  [^java.sql.Connection conn schemas hours]
  (let [threshold (t/minus (t/instant) (t/hours hours))]
    (with-open [stmt (.createStatement conn)]
      (let [classify (fn [schema-name]
                       (try (let [sql (format "select value from %s.cache_info where key = 'created-at'"
                                              schema-name)]
                              (with-open [rset (.executeQuery stmt sql)]
                                (if (.next rset)
                                  (let [date-string (.getString rset "value")
                                        created-at  (java.time.Instant/parse date-string)]
                                    (if (t/before? created-at threshold)
                                      :expired
                                      :recent))
                                  :lacking-created-at)))
                            (catch com.amazon.redshift.util.RedshiftException e
                              (if (re-find #"relation .* does not exist" (or (ex-message e) ""))
                                :old-style-cache
                                (do (log/error e "Error classifying cache schema")
                                    :unknown-error)))
                            (catch Exception e
                              (log/error e "Error classifying cache schema")
                              :unknown-error)))]
        (group-by classify schemas)))))

;;; --------------------------------- Enumeration ----------------------------------
;;;
;;; Pure (read-only) classifiers. Call from REPL to preview what cleanup WOULD do:
;;;
;;;     (with-open [c (.. (sql-jdbc.conn/connection-details->spec :redshift @db-connection-details)
;;;                       jdbc/get-connection)]
;;;       (rs-tx/orphan-schemas c))
;;;     ;; => {:old [...] :expired-cache [...]}

(defn- orphan-schemas
  "Classify every schema in the connected Redshift DB into orphan buckets.
   Returns a map with possibly-empty vectors under each key:
     :old                 -- pre-current-convention test data schemas
     :expired-cache       -- model-persistence cache schemas past TTL
     :lacking-created-at  -- cache schemas with no `cache_info.created-at`
     :old-style-cache     -- cache schemas without a `cache_info` table at all

   Pure: makes 1-2 catalog queries but does NOT drop anything. Use the
   `drop-orphan-*!` fns to act on the result.

   `hours-threshold` is how old a test data schema must be to count as `:old`; nil for the usual default. Cache
   schemas are classified by their own TTL and are unaffected by it."
  [^java.sql.Connection conn hours-threshold]
  (let [{old-convention   :old
         caches-with-info :cache} (reduce (fn [acc s]
                                            (cond (sql.tu.unique-prefix/old-temp-dataset? hours-threshold s)
                                                  (update acc :old conj s)
                                                  (str/starts-with? s "metabase_cache_")
                                                  (update acc :cache conj s)
                                                  :else acc))
                                          {:old [] :cache []}
                                          (fetch-schemas conn))
        {expired-cache      :expired
         old-style-cache    :old-style-cache
         lacking-created-at :lacking-created-at} (classify-cache-schemas
                                                  conn caches-with-info hours-threshold)]
    {:old                (vec old-convention)
     :expired-cache      (vec expired-cache)
     :old-style-cache    (vec old-style-cache)
     :lacking-created-at (vec lacking-created-at)}))

;;; --------------------------------- Destruction ----------------------------------

(defn- drop-orphan-schemas!
  "Drop every schema classified by [[orphan-schemas]] as expired/old, reporting per schema whether it went. See
  [[tx/gc-orphans!]] for the shape; the caller adds `:server`, since a Statement does not know which cluster it is
  on. Never let one orphan block the rest.

  Takes the orphan-map directly so callers can preview-then-drop without
  re-querying. Caller owns the Statement."
  [^java.sql.Statement stmt dry-run? orphans]
  (mapv (fn [[fmt-str schema]]
          (tx/print-progress! :redshift fmt-str schema)
          (try
            (when-not dry-run?
              (.execute stmt (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE;" schema)))
            {:name schema, :status :deleted}
            (catch Exception e
              {:name schema, :status :failed, :error (ex-message e)})))
        (for [[k fmt-str] [[:old                "Dropping old data schema: %s"]
                           [:expired-cache      "Dropping expired cache schema: %s"]
                           [:lacking-created-at "Dropping cache without created-at info: %s"]
                           [:old-style-cache    "Dropping old cache schema without `cache_info` table: %s"]]
              schema       (get orphans k)]
          [fmt-str schema])))

(defn- delete-old-schemas!
  "Remove unneeded schemas from redshift. Local databases are thrown away after
  a test run; shared cloud instances are not. Test runs can leak schemas
  (e.g. persisted models), leading to clusters hitting the max-tables limits.

  Glue: thin wrapper that calls the enumerator + dropper in order. To preview
  from a REPL, call [[orphan-schemas]] directly."
  [^java.sql.Connection conn]
  (let [orphans (orphan-schemas conn 12)]
    (with-open [stmt (.createStatement conn)]
      (drop-orphan-schemas! stmt false orphans))))

(defn- gc-hosts
  "Every cluster tests run against, not just the one a run would pick. `MB_REDSHIFT_TEST_HOSTS` is the fleet
  `drivers.yml` uses; `MB_REDSHIFT_TEST_HOST` is the cluster the stress-test workflows use, and nothing sets both.
  Taking either alone -- as [[random-host]] does, correctly, for a single run -- leaves the other to grow into the
  max-tables limit this sweep exists to prevent."
  []
  (or (not-empty (distinct (concat @hosts (some-> (tx/db-test-env-var :redshift :host) vector))))
      (throw (ex-info "no Redshift hosts configured: set MB_REDSHIFT_TEST_HOSTS or MB_REDSHIFT_TEST_HOST" {}))))

(defn- gc-connection-details
  "Every cluster and database a leaked schema could be in. Built from env vars rather than
  [[db-connection-details]], which pins one random host for the process (fine for tests, but `MB_REDSHIFT_TEST_HOSTS`
  is several clusters) and computes schema filters we don't need via [[unique-session-schema]]."
  []
  (for [host (gc-hosts)
        db   [(tx/db-test-env-var :redshift :db "testdb")
              (tx/db-test-env-var :redshift :db-routing "dev")]]
    {:host     host
     :port     (parse-long (tx/db-test-env-var :redshift :port "5439"))
     :db       db
     :user     (tx/db-test-env-var :redshift :user "metabase_ci")
     :password (tx/db-test-env-var-or-throw :redshift :password)}))

(defn- server-label
  "`host/db`, the `:server` key identifying one cluster+database pair in the nightly report."
  [{:keys [host db]}]
  (str host "/" db))

(defn- with-gc-connection
  "Call `f` with a write-capable Connection to one cluster+database, or return `fallback` built from the exception: a
  cluster that is down, or a database that does not exist on it, must not cost us the others."
  [driver details f fallback]
  (try
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     (sql-jdbc.conn/connection-details->spec driver details)
     {:write? true}
     f)
    (catch Exception e
      (fallback e))))

(defn- with-gc-pool!
  "Map `f` over every cluster+database at once. They are separate servers -- waiting on them one at a time made the
  sweep cost the sum of their latencies rather than the worst of them."
  [f]
  (let [servers (gc-connection-details)]
    (cp/with-shutdown! [pool (cp/threadpool (count servers))]
      (doall (cp/pmap pool f servers)))))

(defmethod tx/gc-orphans! :redshift
  [driver {:keys [hours dry-run?]}]
  ;; Redshift schema names carry their own creation time, so we scan for age via the name
  (into []
        cat
        (with-gc-pool!
          (fn [details]
            (let [server (server-label details)]
              (with-gc-connection
                driver details
                (fn [^java.sql.Connection conn]
                  (with-open [stmt (.createStatement conn)]
                    (mapv #(assoc % :server server)
                          (drop-orphan-schemas! stmt dry-run? (orphan-schemas conn hours)))))
                (fn [e]
                  [{:server server, :name nil, :status :failed, :error (ex-message e)}])))))))

(defmethod tx/count-datasets :redshift
  [driver]
  (into {}
        (with-gc-pool!
          (fn [details]
            (let [server (server-label details)]
              [server (with-gc-connection
                        driver details
                        ;; every schema on the cluster, catalog schemas included: the number worth watching is
                        ;; total pressure toward the max-tables limit, not our share of it
                        (fn [^java.sql.Connection conn]
                          (reduce (fn [n _] (inc n)) 0 (fetch-schemas conn)))
                        (fn [e]
                          (log/errorf "[redshift] could not count schemas on %s: %s" server (ex-message e))
                          nil))])))))

(defn- create-session-schema! [^java.sql.Connection conn]
  (with-open [stmt (.createStatement conn)]
    (doseq [^String sql [(format "DROP SCHEMA IF EXISTS \"%s\" CASCADE;" (unique-session-schema))
                         (format "CREATE SCHEMA \"%s\";" (unique-session-schema))]]
      (log/info (u/format-color 'blue "[redshift] %s" sql))
      (.execute stmt sql))))

(defmethod tx/before-run :redshift
  [driver]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (sql-jdbc.conn/connection-details->spec driver @db-connection-details)
   {:write? true}
   (fn [conn]
     (delete-old-schemas! conn)
     (create-session-schema! conn)))
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (sql-jdbc.conn/connection-details->spec driver @db-routing-connection-details)
   {:write? true}
   (fn [conn]
     (delete-old-schemas! conn)
     (create-session-schema! conn))))

(defn- delete-session-schema!
  "Delete our session schema when the test suite has finished running (CLI only)."
  [^java.sql.Connection conn]
  (with-open [stmt (.createStatement conn)]
    (let [sql (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE;" (unique-session-schema))]
      (log/info (u/format-color 'blue "[redshift] %s" sql))
      (.execute stmt sql))))

(defmethod tx/after-run :redshift
  [driver]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (sql-jdbc.conn/connection-details->spec driver @db-connection-details)
   {:write? true}
   delete-session-schema!)
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (sql-jdbc.conn/connection-details->spec driver @db-routing-connection-details)
   {:write? true}
   delete-session-schema!))

(def ^:dynamic *override-describe-database-to-filter-by-db-name?*
  "Whether to override the production implementation for `describe-database` with a special one that only syncs
  the tables qualified by the database name. This is `true` by default during tests to fake database isolation.
  See (metabase#40310)"
  true)

(defonce ^:private ^{:arglists '([driver database])}
  original-describe-database
  (get-method driver/describe-database* :redshift))

;; For test databases, only sync the tables that are qualified by the db name
(defmethod driver/describe-database* :redshift
  [driver database]
  (if *override-describe-database-to-filter-by-db-name?*
    (let [r                (original-describe-database driver database)
          physical-db-name (data.impl/database-source-dataset-name database)]
      (update r :tables (fn [tables]
                          (into #{}
                                (filter #(or (tx/qualified-by-db-name? physical-db-name (:name %))
                                             ;; the `extsales` table is used for testing external tables (only when
                                             ;; using the normal test-data dataset)
                                             (when (= physical-db-name "test-data")
                                               (= (:name %) "extsales"))))
                                tables))))
    (original-describe-database driver database)))

(deftest ^:parallel describe-database-sanity-check-test
  (testing "Make sure even tho tables from different datasets are all stuffed in one DB we still sync them separately"
    (mt/test-driver :redshift
      (mt/dataset airports
        (is (= #{"airports_airport"
                 "airports_continent"
                 "airports_country"
                 "airports_municipality"
                 "airports_region"}
               (into #{}
                     (map :name)
                     (:tables (driver/describe-database :redshift (mt/db))))))))))

(defmethod ddl.i/format-name :redshift
  [_driver s]
  ;; Redshift is case-insensitive for identifiers and returns them in lower-case by default from system tables, even if
  ;; you create the tables with upper-case characters.
  (u/lower-case-en s))

(mu/defmethod tx/dataset-already-loaded? :redshift
  [driver :- :keyword
   dbdef  :- [:map
              [:database-name     :string]
              [:table-definitions [:sequential
                                   [:map
                                    [:table-name :string]]]]]]
  (or
   ;; if this is a dataset with no tables (for example when using [[metabase.actions.test-util/with-empty-db]]) then we
   ;; can consider the dataset to already be loaded
   (empty? (:table-definitions dbdef))
   ;; otherwise, probe the first table directly. Retry a few times because fresh connections may be routed to
   ;; Redshift compute nodes that haven't propagated DDL changes yet (eventual consistency).
   (let [session-schema (unique-session-schema)
         tabledef       (first (:table-definitions dbdef))
         table-name     (tx/db-qualified-table-name (:database-name dbdef) (:table-name tabledef))
         jdbc-spec      (sql-jdbc.conn/connection-details->spec driver (tx/dbdef->connection-details driver))
         probe-sql      (format "SELECT 1 FROM \"%s\".\"%s\" LIMIT 0" session-schema table-name)
         probe!         (fn []
                          (sql-jdbc.execute/do-with-connection-with-options
                           driver jdbc-spec {:write? false}
                           (fn [^java.sql.Connection conn]
                             (jdbc/query {:connection conn} [probe-sql])
                             true)))]
     (try
       (probe!)
       (catch com.amazon.redshift.util.RedshiftException e
         (if (re-find #"relation .* does not exist" (or (ex-message e) ""))
           false
           (throw e)))
       (catch Exception e
         ;; Transient error (timeout, network, etc.) - retry once after a short delay.
         (log/warnf e "dataset-already-loaded? probe failed for %s.%s, retrying" session-schema table-name)
         (Thread/sleep 1000)
         (try
           (probe!)
           (catch com.amazon.redshift.util.RedshiftException e2
             (if (re-find #"relation .* does not exist" (or (ex-message e2) ""))
               false
               (throw e2)))))))))

(defmethod driver/database-supports? [:redshift :test/use-fake-sync]
  [_driver _feature _database]
  ;; Use real sync in tests on master/release branches to catch sync regressions.
  ;; Use fake sync in tests on feature branches for speed (~10 min savings per test run).
  (not (tx/on-master-or-release-branch?)))

(defmethod tx/fake-sync-schema :redshift
  [_driver]
  (unique-session-schema))

(defn drop-if-exists-and-create-roles!
  [driver details roles]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    (doseq [[role-name _table-perms] roles]
      (let [role-name (sql.tx/qualify-and-quote driver role-name)]
        (doseq [statement [(format "DROP USER IF EXISTS %s;" role-name)
                           (format "CREATE USER %s WITH PASSWORD '%s';" role-name (:password details))]]
          (jdbc/execute! spec [statement] {:transaction? false}))))))

(defn grant-table-perms-to-roles!
  [driver details roles]
  (let [spec   (sql-jdbc.conn/connection-details->spec driver details)
        schema (sql.tx/qualify-and-quote driver (unique-session-schema))]
    (doseq [[role-name table-perms] roles]
      (let [role-name (sql.tx/qualify-and-quote driver role-name)]
        (doseq [[table-name _perms] table-perms]
          (doseq [statement [(format "GRANT USAGE ON SCHEMA %s TO %s" schema role-name)
                             (format "GRANT SELECT ON %s TO %s" table-name role-name)]]
            (jdbc/execute! spec [statement] {:transaction? false})))))))

(defmethod tx/create-and-grant-roles! :redshift
  [driver details roles _user-name _default-role]
  (drop-if-exists-and-create-roles! driver details roles)
  (grant-table-perms-to-roles! driver details roles))

(defmethod tx/drop-roles! :redshift
  [driver details roles _user-name]
  (let [spec   (sql-jdbc.conn/connection-details->spec driver details)
        schema (sql.tx/qualify-and-quote driver (unique-session-schema))]
    (doseq [[role-name _table-perms] roles]
      (let [role-name (sql.tx/qualify-and-quote driver role-name)]
        (doseq [statement [(format "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %s FROM %s" schema role-name)
                           (format "REVOKE ALL PRIVILEGES ON SCHEMA %s FROM %s;" schema role-name)
                           (format "DROP USER IF EXISTS %s" role-name)]]
          (jdbc/execute! spec [statement] {:transaction? false}))))))

(defmethod sql.tx/generated-column-sql :redshift [_ _] nil)
