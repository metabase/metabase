(ns metabase-enterprise.semantic-search.db.datasource
  (:require
   [clojure.string :as str]
   [environ.core :refer [env]]
   [metabase.app-db.core :as mdb]
   [metabase.connection-pool :as connection-pool]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (com.mchange.v2.c3p0 DataSources PooledDataSource)
   (java.net URLDecoder)
   (java.nio.charset StandardCharsets)
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

(def app-db-schema
  "The Postgres schema holding all semantic-search tables when sharing the application database.
  A dedicated schema (rather than a table-name prefix) makes destructive maintenance structurally
  incapable of touching application tables — see the schema handling in
  [[metabase-enterprise.semantic-search.db.migration.impl]]."
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

(comment
  ;; docker-compose.yml
  (.doReset #'db-url "jdbc:postgres://localhost:55432/mb_semantic_search?user=postgres&password=postgres")
  (init-db!)
  (test-connection!))

(def app-db-pgvector-support
  "Cached result of [[check-app-db-pgvector-support!]]: nil = not yet determined, boolean once checked.
  Cached for the JVM lifetime — extensions don't come and go under a running instance. Tests reset it."
  (atom nil))

(defn check-app-db-pgvector-support!
  "Can the application database act as the pgvector store? True only when the `vector` extension ends up
  installed AND our schema exists (or we can create both). Attempts the CREATE EXTENSION / CREATE SCHEMA
  right here so the cached answer reflects real privileges, not optimism."
  []
  (let [app-db (mdb/data-source)
        {:keys [installed available]}
        (jdbc/execute-one! app-db
                           [(str "SELECT"
                                 " EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed,"
                                 " EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') AS available")]
                           {:builder-fn jdbc.rs/as-unqualified-lower-maps})
        installed (cond
                    installed true

                    (not available)
                    (do (log/info (str "Semantic search: the application database has no pgvector extension"
                                       " available; install pgvector (or set MB_PGVECTOR_DB_URL) to enable"
                                       " semantic search."))
                        false)

                    :else
                    (try
                      (jdbc/execute! app-db ["CREATE EXTENSION IF NOT EXISTS vector"])
                      true
                      (catch Exception e
                        ;; pgvector is an untrusted extension: installing it typically needs superuser
                        (log/warn e (str "Semantic search: the pgvector extension is available on the"
                                         " application database but could not be installed (insufficient"
                                         " privileges?). Run CREATE EXTENSION vector; as a superuser, or set"
                                         " MB_PGVECTOR_DB_URL, to enable semantic search."))
                        false)))]
    (if-not installed
      false
      (try
        (jdbc/execute! app-db [(str "CREATE SCHEMA IF NOT EXISTS \"" app-db-schema "\"")])
        true
        (catch Exception e
          (log/warnf e (str "Semantic search: could not create the %s schema on the application"
                            " database. Grant CREATE on the database to the Metabase user, or set"
                            " MB_PGVECTOR_DB_URL, to enable semantic search.")
                     app-db-schema)
          false)))))

(defn- app-db-pgvector-supported?
  "Cached [[check-app-db-pgvector-support!]]. Returns false (without caching) while the app DB is not yet
  set up, so an early call during startup cannot pin a premature answer."
  []
  (if-some [cached @app-db-pgvector-support]
    cached
    (boolean
     (when (mdb/db-is-set-up?)
       (locking app-db-pgvector-support
         (if-some [cached @app-db-pgvector-support]
           cached
           (let [supported (try
                             (boolean (check-app-db-pgvector-support!))
                             (catch Exception e
                               (log/warn e "Semantic search: pgvector support check on the application database failed.")
                               false))]
             (reset! app-db-pgvector-support supported)
             supported)))))))

(defn pgvector-mode
  "How this instance reaches its pgvector database:
    :dedicated   MB_PGVECTOR_DB_URL is set (always wins)
    :app-db      no URL, but the Postgres application database supports the vector extension
    :unavailable no pgvector anywhere — semantic search cannot run."
  []
  (cond
    (not (str/blank? db-url))            :dedicated
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
