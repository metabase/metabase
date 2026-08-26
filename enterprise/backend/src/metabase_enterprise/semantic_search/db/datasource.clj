(ns metabase-enterprise.semantic-search.db.datasource
  (:require
   [clojure.string :as str]
   [environ.core :refer [env]]
   [metabase.app-db.core :as mdb]
   [metabase.connection-pool :as connection-pool]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.quoted :as quoted]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (com.mchange.v2.c3p0 DataSources PooledDataSource)
   (java.net URLDecoder)
   (java.nio.charset StandardCharsets)
   (java.sql Connection SQLException)
   (java.util.concurrent Executor)
   (org.postgresql PGProperty)))

(set! *warn-on-reflection* true)

(def data-source
  "Atom to hold the pooled JDBC data source for the semantic search database.
  Only ever holds a dedicated (MB_PGVECTOR_DB_URL) pool; in app-db mode the shared application pool is
  returned by [[ensure-initialized-data-source!]] without being stored here, so [[shutdown-db!]] can never
  close it."
  (atom nil))

(def db-url
  "The database URL used to connect to pgvector"
  (env :mb-pgvector-db-url))

(defn dedicated-url-configured?
  "True when MB_PGVECTOR_DB_URL is set to a non-blank value.
  Canonical check for \"a dedicated pgvector store is configured\"; using it everywhere stops a
  whitespace-only URL from reading as configured in one subsystem and unset in another."
  []
  (not (str/blank? db-url)))

(def app-db-schema
  "The Postgres schema holding all semantic-search tables when sharing the application database.
  Isolating by schema makes destructive maintenance (see
  [[metabase-enterprise.semantic-search.db.migration.impl]]) structurally incapable of touching
  application tables."
  "semantic_search")

;; All pgvector config — connection *and* connection-pool parameters — rides MB_PGVECTOR_DB_URL, so a
;; deployment sets everything in one place (the DB secret) with no env-var-vs-URL precedence to reason
;; about. c3p0 pool params can't ride the JDBC URL into the driver, so we parse them out here (see
;; parse-db-url) and hand the rest to pgjdbc. pgjdbc *silently ignores* params it doesn't recognize, so we
;; validate every param against an allowlist and throw on startup rather than let a typo become a
;; silently-dropped setting. Cf. metabase.app-db.connection-pool-setup for the analogous app-db pool.

;; c3p0 props we always set and don't expose for tuning.
(def ^:private fixed-pool-props
  {"idleConnectionTestPeriod"     60
   "maxIdleTimeExcessConnections" (* 10 60)  ; cull excess idle connections after 10 minutes
   "maxConnectionAge"             (* 30 60)  ; recycle any connection after 30 minutes
   ;; c3p0 defaults to 3 per miss; 1 avoids tripling the cold-start burst on the shared RDS.
   "acquireIncrement"             1
   "dataSourceName"               "metabase-semantic-search-db"})

(defn- parse-bool [^String s]
  (case (u/lower-case-en (str/trim s)) "true" true "false" false nil))

;; Overridable c3p0 knobs: name -> [default parse-fn]. Operators override by setting the same key on
;; MB_PGVECTOR_DB_URL; names match c3p0's own so they map straight onto its docs. parse-fn returns nil on a
;; malformed value, which we surface as a startup error.
(def ^:private tunable-pool-props
  {;; 0 idle connections is what makes a shared RDS viable. Cold start costs one handshake, warmed
   ;; concurrently with the embedding round-trip (see semantic-search.index/query-index). Set minPoolSize=1
   ;; to pin a warm connection on a hot instance.
   "minPoolSize"                          [0     parse-long]
   "initialPoolSize"                      [0     parse-long]
   "maxPoolSize"                          [5     parse-long]
   ;; Fail fast on pool exhaustion (c3p0 default 0 blocks forever); the engine falls back to appdb search
   ;; on error (see semantic-search.core/results).
   "checkoutTimeout"                      [10000 parse-long]
   ;; c3p0's leak detector, off by default: it destroys connections by checkout *duration*, so any value
   ;; low enough to catch leaks also kills slow work (reindex DDL, bulk upserts). Enable with the
   ;; stack-traces knob on a canary to hunt a suspected leak.
   "unreturnedConnectionTimeout"          [0     parse-long]
   "debugUnreturnedConnectionStackTraces" [false parse-bool]
   ;; Off by default (idleConnectionTestPeriod covers idle conns); matches app-db. Flip on if the shared
   ;; RDS drops connections under the pool.
   "testConnectionOnCheckout"             [false parse-bool]})

;; Postgres connection properties pgjdbc recognizes on the classpath; read at runtime so it tracks the
;; driver version. Anything on the URL that's neither a tunable pool knob nor one of these is a typo.
;; NB: explicit fn rather than the 1.12 `PGProperty/.getName` method value — eastwood's analyzer can't
;; parse the latter yet.
(def ^:private known-connection-params
  (into #{} (map #(.getName ^PGProperty %)) (PGProperty/values)))

(defn- url-decode ^String [^String s]
  (URLDecoder/decode s StandardCharsets/UTF_8))

(defn- split-query
  "Split a JDBC URL into [base pairs], where pairs is a seq of raw [key value] strings.
  Pairs are left verbatim so connection params pass through to pgjdbc exactly as written; only pool-knob
  values are decoded, in parse-db-url."
  [^String url]
  (let [[base query] (str/split url #"\?" 2)]
    ;; split each pair on its first '=' only, so a value may itself contain '=' (e.g. options=-c foo=bar)
    [base (for [pair  (some-> query (str/split #"&"))
                :when (seq pair)
                :let  [[k v] (str/split pair #"=" 2)]]
            [k (or v "")])]))

(defn- parse-db-url
  "Parse a pgvector JDBC URL into {:jdbc-url ... :pool-props ...}, or throw if it carries an unrecognized
  parameter."
  [^String url]
  (let [[base pairs]           (split-query url)
        default-pool           (merge fixed-pool-props
                                      (update-vals tunable-pool-props first))
        {:keys [pool conn]}
        (reduce
         (fn [acc [k raw-v]]
           (cond
             ;; a c3p0 knob: coerce and apply to the pool (pgjdbc can't read these off the URL)
             (contains? tunable-pool-props k)
             (let [parse  (second (tunable-pool-props k))
                   parsed (parse (url-decode raw-v))]
               (when (nil? parsed)
                 (throw (ex-info (format "Invalid value for pgvector pool parameter %s: %s" k raw-v)
                                 {:param k, :value raw-v})))
               (assoc-in acc [:pool k] parsed))

             ;; a recognized pgjdbc connection property: leave it on the URL for the driver
             (contains? known-connection-params k)
             (update acc :conn conj (str k "=" raw-v))

             ;; pgjdbc would silently ignore anything else, so treat it as a typo and fail loudly
             :else
             (throw (ex-info (format (str "Unknown pgvector URL parameter %s. Expected a c3p0 pool knob "
                                          "(%s) or a Postgres connection property.")
                                     k (str/join ", " (sort (keys tunable-pool-props))))
                             {:param k}))))
         {:pool default-pool, :conn []}
         pairs)]
    {:jdbc-url   (cond-> base (seq conn) (str "?" (str/join "&" conn)))
     :pool-props pool}))

(defn- parsed-db-config
  "Parse [[db-url]] into {:jdbc-url ... :pool-props ...}, or throw if it is unset."
  []
  (if db-url
    (parse-db-url db-url)
    (throw (ex-info "MB_PGVECTOR_DB_URL environment variable is required for semantic search" {}))))

(defn shutdown-db!
  "Close the pooled data source (if any) and clear it, releasing all server-side connections.
  Safe to call when the pool was never initialized; a later [[init-db!]] builds a fresh pool."
  []
  (locking data-source
    (when-let [ds @data-source]
      (reset! data-source nil)
      (log/info "Closing semantic search connection pool")
      (.close ^PooledDataSource ds))))

;; Tests redef [[data-source]] and close their pools themselves; this hook only sees the root binding,
;; so it closes at most the production pool.
(defonce ^:private shutdown-hook
  (delay (.addShutdownHook (Runtime/getRuntime)
                           (Thread. ^Runnable shutdown-db! "semantic-search-pool-shutdown"))))

(defn init-db!
  "Initialize c3p0 connection pool for semantic search database.
   Requires MB_PGVECTOR_DB_URL environment variable."
  []
  (locking data-source
    (or @data-source
        (let [{:keys [jdbc-url pool-props]} (parsed-db-config)
              unpooled-ds (jdbc/get-datasource {:jdbcUrl jdbc-url})
              pooled-ds   (DataSources/pooledDataSource
                           ^javax.sql.DataSource unpooled-ds
                           (connection-pool/map->properties pool-props))]
          (log/info "Initializing semantic search connection pool with properties:" pool-props)
          (force shutdown-hook)
          (reset! data-source pooled-ds)))))

(defn test-connection!
  "Test database connectivity"
  []
  (if @data-source
    (try
      (let [result (jdbc/execute-one! @data-source ["SELECT 1 as test"])]
        (log/info "Semantic search database connection successful:" result)
        result)
      (catch Exception e
        (log/error "Semantic search database connection failed:" (.getMessage e))
        (throw e)))
    (throw (ex-info "Semantic search connection pool is not initialized. Call init-db! first." {}))))

(def ^:private probe-timeout-params
  "pgjdbc timeouts, in seconds, for the readiness probe, so a blackholed host can't block it forever."
  {"connectTimeout" "5"
   "socketTimeout"  "10"})

(def ^:private probe-query-timeout-seconds
  "Statement timeout for the readiness probe, for a server that accepts the query and never answers."
  10)

(defn- probe-jdbc-url
  "The dedicated pgvector URL with [[probe-timeout-params]] applied.
  These replace any timeouts on MB_PGVECTOR_DB_URL rather than deferring to them: an operator raises those
  for long index builds, and a probe left waiting that long strands a thread and a server-side connection
  every time it is abandoned -- interrupting it can't end a blocking socket read."
  []
  (let [[base pairs] (split-query (:jdbc-url (parsed-db-config)))
        query        (concat (for [[k v] pairs
                                   :when (not (probe-timeout-params k))]
                               (str k "=" v))
                             (for [[k v] probe-timeout-params]
                               (str k "=" v)))]
    (cond-> base
      (seq query) (str "?" (str/join "&" query)))))

(defn probe-dedicated-connection!
  "Test the dedicated pgvector database, without initializing or borrowing its connection pool.
  Always a one-shot connection: a pooled one carries the pool's timeouts, and waiting on a saturated pool
  would read as an unreachable store."
  []
  (jdbc/execute-one! (jdbc/get-datasource {:jdbcUrl (probe-jdbc-url)})
                     ["SELECT 1 AS test"]
                     {:timeout probe-query-timeout-seconds}))

(comment
  ;; docker-compose.yml
  (.doReset #'db-url "jdbc:postgres://localhost:55432/mb_semantic_search?user=postgres&password=postgres")
  (init-db!)
  (test-connection!))

(def app-db-pgvector-support
  "Latches `true` once the app db is confirmed to support pgvector; nil until then.
  A confirmed extension doesn't vanish under a running instance, so `true` is permanent. A negative result
  is NOT latched — it opens a [[probe-cooldown-timer]] and is re-probed, so installing pgvector on a
  running instance is picked up without a restart. Tests reset it."
  (atom nil))

(def probe-cooldown-timer
  "A [[u/start-timer]] taken when the last app-db pgvector probe came back unsupported or errored, or nil
  when a probe is due. Bounds re-probing to once per [[probe-cooldown-ms]] so an absent extension doesn't
  re-query the catalog on every search and 20s indexer tick. Tests reset it."
  (atom nil))

(def app-db-support-check-errored?
  "Whether the last app-db pgvector support check failed to answer, rather than answering no.
  Both outcomes read as unsupported, but only the second is a fact: the readiness probe uses this to report
  that it couldn't find out instead of publishing a guess it would then sit on for an hour. Tests reset it."
  (atom false))

(def ^:private probe-cooldown-ms
  "How long an unsupported or failed app-db pgvector probe is trusted before re-probing.
  Long enough that a never-provisioned instance isn't running a rolled-back CREATE probe into its DDL audit
  log every few seconds, short enough to pick up a runtime `CREATE EXTENSION` / privilege grant without a
  restart."
  (.toMillis (java.time.Duration/ofMinutes 5)))

(defonce ^{:doc "Log-once latch for the \"no pgvector\" operator hint; the negative probe recurs each
  cooldown, so without it the hint would repeat. Tests reset it."}
  logged-pgvector-absent?
  (atom false))

(defn- probe-due?
  "True when no app-db pgvector probe cooldown is active."
  []
  (let [timer @probe-cooldown-timer]
    (or (nil? timer) (>= (u/since-ms timer) probe-cooldown-ms))))

(def ^:private provisioning-denied-sql-states
  "The SQLStates that answer the provisioning question with a no: this role may not create the pieces that
  are missing, or this server cannot host them at all."
  #{"42501"   ; insufficient_privilege -- the role lacks CREATE
    "0A000"   ; feature_not_supported -- e.g. extension "vector" is not available on this server
    "58P01"   ; undefined_file -- the extension's control file is missing from the installation
    "42704"}) ; undefined_object

(defn- exception-chain
  "Every exception reachable from `e`, following causes and, for a SQLException, its next exception.
  JDBC hangs sibling errors off the latter, which the usual cause walk never reaches, so the refusal can sit
  a link off the path [[u/full-exception-chain]] takes."
  [e]
  (loop [pending [e], seen #{}, found []]
    (if-let [^Throwable x (first pending)]
      (if (seen x)
        (recur (rest pending) seen found)
        (recur (into (vec (rest pending))
                     (remove nil?)
                     [(.getCause x)
                      (when (instance? SQLException x) (.getNextException ^SQLException x))])
               (conj seen x)
               (conj found x)))
      found)))

(defn- provisioning-denied?
  "Whether `e` is the database refusing to provision, rather than failing to answer.
  Anything else -- a statement timeout, a dropped connection, exhausted resources, interruption -- leaves
  the question open, and reads as a denial only if we let it."
  [e]
  (boolean (some #(and (instance? SQLException %)
                       (contains? provisioning-denied-sql-states (.getSQLState ^SQLException %)))
                 (exception-chain e))))

(def ^:private probe-network-timeout-ms
  "Socket-level bound on a probe's reads, for a host that accepts the connection and then stops answering.
  A statement timeout needs a working connection to carry the cancel, so it does nothing there; the readiness
  probe cannot be interrupted out of a stuck read either, and one left in that state blocks every later
  refresh for the life of the process."
  (int (* 15 1000)))

(def ^:private ^Executor same-thread-executor
  "For [[java.sql.Connection/setNetworkTimeout]], which requires an executor but only runs bookkeeping on it."
  (reify Executor
    (execute [_ r] (.run ^Runnable r))))

(defn- network-timeout
  "The connection's network timeout, or nil where the driver has no opinion."
  [^Connection conn]
  (try
    (.getNetworkTimeout conn)
    (catch SQLException _ nil)))

(defn- set-network-timeout!
  [^Connection conn ^long timeout-ms]
  (try
    (.setNetworkTimeout conn same-thread-executor timeout-ms)
    (catch SQLException _
      ;; Unsupported, or the connection is already broken. Either way the statement timeouts still apply.
      nil)))

(defn- with-probe-connection
  "Call `f` with an app-db connection whose reads are bounded by [[probe-network-timeout-ms]].
  The bound is lifted again before check-in: this is a pooled connection, and c3p0 hands the same physical one
  to whoever borrows it next, who is entitled to the app db's own patience -- a migration or a `copy-to-h2`
  would fail in seconds under the probe's. Both calls are local to the socket, so neither can hang.
  Check-in is therefore unbounded, which is the lesser problem: a connection whose read just timed out is
  broken, and c3p0 destroys rather than reuses it."
  [f]
  (with-open [conn (jdbc/get-connection (mdb/data-source))]
    (let [restore-to (network-timeout conn)]
      (set-network-timeout! conn probe-network-timeout-ms)
      (try
        (f conn)
        (finally
          (when restore-to
            (set-network-timeout! conn restore-to)))))))

(defn- app-db-can-provision-pgvector?
  "Whether the app-db user can create whichever store pieces are still missing, checked without persisting
  them: the CREATEs run in a transaction that always rolls back.
  Attempts CREATE EXTENSION only when `create-extension?` and CREATE SCHEMA only when `create-schema?`, so
  an already-installed extension or existing schema needs no create privilege.
  A refusal reads as false; a check that never got that far throws, so the caller can tell the two apart."
  [conn create-extension? create-schema?]
  (try
    (jdbc/with-transaction [tx conn {:rollback-only true}]
      (when create-extension?
        (jdbc/execute! tx ["CREATE EXTENSION IF NOT EXISTS vector"]
                       {:timeout probe-query-timeout-seconds}))
      (when create-schema?
        (jdbc/execute! tx [(str "CREATE SCHEMA IF NOT EXISTS " (quoted/postgres app-db-schema))]
                       {:timeout probe-query-timeout-seconds})))
    true
    (catch Exception e
      (when-not (provisioning-denied? e)
        (throw e))
      (log/debugf "Semantic search: the application database user cannot provision the pgvector store: %s"
                  (ex-message e))
      false)))

(defn check-app-db-pgvector-support
  "Can the application database act as the pgvector store?
  True when the `vector` extension and the [[app-db-schema]] schema are present, or the app-db user can
  create whichever is missing.
  Provisioning is verified in a rolled-back transaction (CREATE EXTENSION / CREATE SCHEMA), not read from
  pg_available_extensions: managed Postgres often lists the extension as available while denying the DDL.
  The probe persists nothing, so the unlicensed and disabled instances whose availability predicates reach
  here never mutate the app db; the persisted CREATE EXTENSION / CREATE SCHEMA run only on the activation
  path ([[metabase-enterprise.semantic-search.pgvector-api/init-semantic-search!]]).
  Runs on one [[with-probe-connection]], so a host that stops answering ends the check instead of stranding
  the readiness probe, which cannot be interrupted out of a stuck read."
  []
  (with-probe-connection
    (fn [conn]
      ;; The schema_exists SQL alias reads information_schema.schemata (privilege-filtered), not
      ;; pg_namespace. It answers "a semantic_search schema this role can use exists", not mere catalog
      ;; presence: a schema the app-db role lacks USAGE on reads as absent, so the store degrades to
      ;; unavailable rather than passing here and crashing later when init creates tables it can't write.
      (let [{:keys [installed available schema-exists]}
            (jdbc/execute-one! conn
                               [(str "SELECT"
                                     " EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed,"
                                     " EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') AS available,"
                                     " EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = ?) AS schema_exists")
                                app-db-schema]
                               {:builder-fn jdbc.rs/as-unqualified-kebab-maps
                                :timeout    probe-query-timeout-seconds})]
        (cond
          (not (or installed available)) false
          (and installed schema-exists)  true
          :else                          (app-db-can-provision-pgvector? conn
                                                                         (not installed)
                                                                         (not schema-exists)))))))

(defn probe-app-db-store!
  "Whether the app db is a usable pgvector store right now: it answers, and it can still host the store.
  Uncached, so an extension dropped under a running instance shows up despite [[app-db-pgvector-support]]
  latching true.
  Asks [[check-app-db-pgvector-support]], the same question [[pgvector-mode]] selects `:app-db` on, so the
  two can't disagree. Demanding an installed extension instead would report every instance that has not
  activated semantic search yet -- where nothing has run `CREATE EXTENSION` -- as permanently unreachable."
  []
  (check-app-db-pgvector-support))

(defn- app-db-pgvector-supported?
  "Whether the application database can act as the pgvector store, via a cached probe.
  A confirmed `true` latches for the JVM lifetime (see [[app-db-pgvector-support]]); an unsupported or
  errored probe is trusted only for [[probe-cooldown-ms]] before re-probing, so a runtime `CREATE
  EXTENSION` / package install is picked up without a restart while a persistent negative doesn't re-query
  and re-warn on every call. Returns false while the app db is not yet set up."
  []
  (if (true? @app-db-pgvector-support)
    true
    (boolean
     (when (and (mdb/db-is-set-up?) (probe-due?))
       (locking app-db-pgvector-support
         (cond
           (true? @app-db-pgvector-support) true
           ;; a racing thread probed first and opened the cooldown
           (not (probe-due?))               false
           :else
           (try
             (if (check-app-db-pgvector-support)
               (do
                 (log/info (str "Semantic search: using the application database as the pgvector store"
                                " (MB_PGVECTOR_DB_URL is not set). Set it if this instance should use a"
                                " dedicated pgvector database."))
                 (reset! app-db-pgvector-support true)
                 ;; Outcome before cooldown, always: a reader takes neither under the lock, and one that
                 ;; saw the new cooldown beside the previous outcome would trust a result we just replaced.
                 (reset! app-db-support-check-errored? false)
                 (reset! probe-cooldown-timer nil)
                 true)
               (do
                 (when (compare-and-set! logged-pgvector-absent? false true)
                   (log/info (str "Semantic search: the application database cannot host pgvector (the"
                                  " app-db user cannot create the vector extension or the semantic_search"
                                  " schema). Install pgvector and grant CREATE, or set MB_PGVECTOR_DB_URL;"
                                  " it is picked up automatically, no restart needed.")))
                 (reset! app-db-support-check-errored? false)
                 (reset! probe-cooldown-timer (u/start-timer))
                 false))
             (catch Exception e
               (reset! app-db-support-check-errored? true)
               (reset! probe-cooldown-timer (u/start-timer))
               (log/warn (str "Semantic search: pgvector support check on the application database failed;"
                              " will retry after the cooldown:")
                         (ex-message e))
               false))))))))

(defn pgvector-mode
  "How this instance reaches its pgvector database:
    :dedicated   MB_PGVECTOR_DB_URL is set (always wins)
    :app-db      no URL, but the Postgres application database supports the vector extension
    :unavailable no pgvector anywhere — semantic search cannot run."
  []
  (cond
    (dedicated-url-configured?)          :dedicated
    (and (= :postgres (mdb/db-type))
         (app-db-pgvector-supported?))   :app-db
    :else                                :unavailable))

(defn pgvector-configured?
  "Canonical availability predicate: does this instance have a pgvector database to work with?"
  []
  (not= :unavailable (pgvector-mode)))

(defn ensure-initialized-data-source!
  "Return datasource. Initialize if necessary.
  In app-db mode this is the application database's own shared pool."
  []
  (or @data-source
      (case (pgvector-mode)
        :dedicated   (init-db!)
        :app-db      (mdb/data-source)
        :unavailable (throw (ex-info (str "Semantic search requires a pgvector database: set MB_PGVECTOR_DB_URL,"
                                          " or use a Postgres application database with the pgvector extension"
                                          " available.")
                                     {:mode :unavailable})))))
