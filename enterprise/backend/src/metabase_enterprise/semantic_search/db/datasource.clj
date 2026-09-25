(ns metabase-enterprise.semantic-search.db.datasource
  (:require
   [clojure.string :as str]
   [environ.core :refer [env]]
   [metabase.connection-pool :as connection-pool]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc])
  (:import
   (com.mchange.v2.c3p0 DataSources)
   (java.net URLDecoder)
   (java.nio.charset StandardCharsets)
   (javax.sql DataSource)))

(set! *warn-on-reflection* true)

(def data-source
  "Atom to hold the pooled JDBC data source for the semantic search database."
  (atom nil))

(def db-url
  "The database URL used to connect to pgvector"
  (env :mb-pgvector-db-url))

;; See metabase.app-db.connection-pool-setup for more details on these properties
;; TODO: not sure if we need the MetabaseConnectionCustomizer like in the app DB connection pool setup
(def ^:private semantic-search-connection-pool-props
  "Connection pool properties for semantic search database using c3p0."
  {"idleConnectionTestPeriod"     60
   "maxIdleTimeExcessConnections" (* 10 60)  ; 5 minutes
   "maxConnectionAge"             (* 30 60)  ; 30 minutes
   "maxPoolSize"                  5          ; Small pool to start
   "minPoolSize"                  1
   "initialPoolSize"              1
   "dataSourceName"               "metabase-semantic-search-db"})

(defn- url-decode ^String [^String s]
  (URLDecoder/decode s StandardCharsets/UTF_8))

(defn- split-query
  "Split a JDBC URL into [base pairs], where pairs is a seq of raw [key value] strings."
  [^String url]
  (let [[base query] (str/split url #"\?" 2)]
    ;; split each pair on its first '=' only, so a value may itself contain '=' (e.g. options=-c foo=bar)
    [base (for [pair  (some-> query (str/split #"&"))
                :when (seq pair)
                :let  [[k v] (str/split pair #"=" 2)]]
            [k (or v "")])]))

(defn- parse-db-url
  "Parse a pgvector JDBC URL into {:jdbc-url ... :credentials ...}, taking the credentials off the URL.
  Other params stay on the URL as written."
  [^String url]
  (let [[base pairs] (split-query url)
        ;; credentials: passed to pgjdbc as connection properties, off the URL, because the URL gets
        ;; printed -- pgjdbc logs it at DEBUG on every connection, and DriverManager quotes it in its
        ;; "No suitable driver" error
        credential?  (comp #{"user" "password" "sslpassword"} first)
        conn         (for [[k v] (remove credential? pairs)] (str k "=" v))]
    {:jdbc-url    (cond-> base (seq conn) (str "?" (str/join "&" conn)))
     :credentials (into {} (for [[k v] (filter credential? pairs)] [(keyword k) (url-decode v)]))}))

(defn- build-db-config
  "Build the next.jdbc spec for [[db-url]], with the credentials as driver properties rather than on the URL."
  []
  (if db-url
    (let [{:keys [jdbc-url credentials]} (parse-db-url db-url)]
      (assoc credentials :jdbcUrl jdbc-url))
    (throw (ex-info "MB_PGVECTOR_DB_URL environment variable is required for semantic search" {}))))

(defn- redacted-data-source
  "Wrap `ds` so it prints without its JDBC URL, which can carry the database credentials.
  c3p0 prints the data source it pools in its own string form, and that reaches the logs through exception
  messages such as \"... has been closed() -- you can no longer use it\"."
  ^DataSource [^DataSource ds]
  (reify DataSource
    (getConnection [_] (.getConnection ds))
    (getConnection [_ user password] (.getConnection ds user password))
    (getLoginTimeout [_] (.getLoginTimeout ds))
    (setLoginTimeout [_ seconds] (.setLoginTimeout ds seconds))
    Object
    (toString [_] "pgvector JDBC data source (URL redacted)")))

(defn init-db!
  "Initialize c3p0 connection pool for semantic search database.
   Requires MB_PGVECTOR_DB_URL environment variable."
  []
  (locking data-source
    (or @data-source
        (let [db-config   (build-db-config)
              unpooled-ds (redacted-data-source (jdbc/get-datasource db-config))
              pooled-ds   (DataSources/pooledDataSource
                           unpooled-ds
                           (connection-pool/map->properties semantic-search-connection-pool-props))]
          (log/info "Initializing semantic search connection pool with properties:" semantic-search-connection-pool-props)
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

(defn ensure-initialized-data-source!
  "Return datasource. Initialize if necessary."
  []
  (or @data-source (init-db!)))
