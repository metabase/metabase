(ns metabase-enterprise.semantic-search.db.sqlite
  "An embedded SQLite store for semantic search, for instances without a pgvector database.

  Enabled by `MB_SEMANTIC_SEARCH_SQLITE_PATH` (a file path; its parent directories are created on demand). A
  dedicated `MB_PGVECTOR_DB_URL` still wins when both are set. The store runs on the xerial driver that already
  ships for the Sample Database: no native extension and no custom SQLite build is needed.

  The rest of the module is written against Postgres, so each pooled connection is dressed up to accept the few
  Postgres-isms the shared SQL leans on, as JVM user functions:

    vec_distance_cosine(a, b)  cosine distance between two float32 little-endian BLOBs (pgvector's `<=>`). Same
                               name, signature and BLOB format as sqlite-vec's, so pointing
                               `MB_SEMANTIC_SEARCH_SQLITE_VEC_PATH` at the sqlite-vec loadable extension swaps in
                               its SIMD implementation with no query changes.
    clock_timestamp(), now()   the current time as fixed-width UTC text (see [[->timestamp-text]])
    greatest(...), least(...)  Postgres semantics: NULL arguments are ignored
    regexp_replace(s, p, r[, flags])  Java regex; replaces every match with flag `g`, the first otherwise

  Timestamps are stored as fixed-width ISO-8601 UTC text with microsecond precision
  (`2026-01-02T03:04:05.123456Z`), so text comparison is chronological and SQLite's date functions (`julianday`)
  still parse them. Left to itself xerial would bind a `java.sql.Timestamp` as epoch millis and an `Instant` via its
  variable-precision `toString`, both of which compare wrongly against stored values, so each connection is also
  wrapped in a small JDBC adapter that binds and reads timestamps, booleans and aggregates the way pgjdbc does (see
  [[wrap-connection]])."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [environ.core :refer [env]]
   [metabase.connection-pool :as connection-pool]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc])
  (:import
   (com.mchange.v2.c3p0 DataSources)
   (java.lang.reflect Method)
   (java.nio ByteBuffer ByteOrder)
   (java.sql Connection Timestamp)
   (java.time Instant LocalDate OffsetDateTime ZoneOffset ZonedDateTime)
   (java.time.format DateTimeFormatter)
   (java.time.temporal ChronoUnit)
   (java.util Date)
   (java.util.regex Pattern)
   (javax.sql DataSource)
   (org.sqlite Function SQLiteConfig SQLiteConfig$JournalMode SQLiteConfig$Pragma SQLiteConfig$SynchronousMode
               SQLiteConfig$TempStore SQLiteConfig$TransactionMode SQLiteDataSource)))

(set! *warn-on-reflection* true)

(def db-path
  "The SQLite database file holding the semantic search store, from `MB_SEMANTIC_SEARCH_SQLITE_PATH`."
  (env :mb-semantic-search-sqlite-path))

(def vec-extension-path
  "Optional path to the sqlite-vec loadable extension (`MB_SEMANTIC_SEARCH_SQLITE_VEC_PATH`). When set, each
  connection loads it and uses its native `vec_distance_cosine` instead of the JVM one."
  (env :mb-semantic-search-sqlite-vec-path))

(defn configured?
  "True when `MB_SEMANTIC_SEARCH_SQLITE_PATH` is set to a non-blank value."
  []
  (not (str/blank? db-path)))

;;; ------------------------------------------------ Value encoding ------------------------------------------------

(def ^:private ^DateTimeFormatter timestamp-formatter
  (.withZone (DateTimeFormatter/ofPattern "uuuu-MM-dd'T'HH:mm:ss.SSSSSS'Z'") ZoneOffset/UTC))

(defn ->instant
  "Coerce a timestamp as stored or bound by either store (text, `Timestamp`, `OffsetDateTime`, ...) to an `Instant`."
  ^Instant [t]
  (cond
    (nil? t)                        nil
    (instance? Instant t)           t
    (string? t)                     (Instant/parse t)
    (instance? OffsetDateTime t)    (.toInstant ^OffsetDateTime t)
    (instance? ZonedDateTime t)     (.toInstant ^ZonedDateTime t)
    (instance? Timestamp t)         (.toInstant ^Timestamp t)
    (instance? Date t)              (.toInstant ^Date t)
    :else                           (Instant/ofEpochMilli (inst-ms t))))

(defn ->timestamp-text
  "Encode `t` the way this store keeps timestamps: fixed-width UTC text with microsecond precision.
  A `LocalDate` encodes as `yyyy-MM-dd`, which sorts before every timestamp on that day, i.e. as its midnight."
  [t]
  (cond
    (nil? t)                   nil
    (instance? LocalDate t)    (str t)
    :else                      (.format timestamp-formatter (.truncatedTo (->instant t) ChronoUnit/MICROS))))

(defn now-text
  "The current time, encoded by [[->timestamp-text]]."
  []
  (->timestamp-text (Instant/now)))

(defn vector->blob
  "Encode an embedding as a float32 little-endian BLOB (sqlite-vec's vector format)."
  ^bytes [embedding]
  (let [buf (.order (ByteBuffer/allocate (* 4 (count embedding))) ByteOrder/LITTLE_ENDIAN)]
    (doseq [v embedding]
      (when-not (number? v)
        (throw (ex-info "Embedding contains non-numeric value" {:invalid-value v})))
      (.putFloat buf (float v)))
    (.array buf)))

(defn blob->float-array
  "Decode a float32 little-endian BLOB into a float array."
  ^floats [^bytes blob]
  (let [fb  (.asFloatBuffer (.order (ByteBuffer/wrap blob) ByteOrder/LITTLE_ENDIAN))
        out (float-array (.remaining fb))]
    (.get fb out)
    out))

(defn blob->vector
  "Decode a float32 little-endian BLOB into a vector of doubles, each the shortest decimal that round-trips its float
  (`0.12`, not `0.11999999731779099`) -- the way pgvector prints its float4 elements, so both stores hand back the
  same embedding."
  [blob]
  (mapv #(Double/parseDouble (Float/toString %)) (blob->float-array blob)))

(defn cosine-distance
  "`1 - cos(a, b)` over two float32 BLOBs, as pgvector's `<=>`: NaN when either vector has zero norm, an error
  when their dimensions differ."
  ^double [^bytes a ^bytes b]
  (when-not (= (alength a) (alength b))
    (throw (ex-info (format "different vector dimensions %d and %d" (quot (alength a) 4) (quot (alength b) 4)) {})))
  (let [fa (.asFloatBuffer (.order (ByteBuffer/wrap a) ByteOrder/LITTLE_ENDIAN))
        fb (.asFloatBuffer (.order (ByteBuffer/wrap b) ByteOrder/LITTLE_ENDIAN))
        n  (.remaining fa)]
    (loop [i 0, dot 0.0, na 0.0, nb 0.0]
      (if (< i n)
        (let [x (double (.get fa i))
              y (double (.get fb i))]
          (recur (unchecked-inc i) (+ dot (* x y)) (+ na (* x x)) (+ nb (* y y))))
        (- 1.0 (/ dot (Math/sqrt (* na nb))))))))

;;; ----------------------------------------------- Full-text search -----------------------------------------------

(defn- fts5-string
  "Quote `s` as an FTS5 string, so user input can never be read as query syntax."
  [s]
  (str "\"" (str/replace s "\"" "\"\"") "\""))

(defn- fts5-item
  "One search term or phrase as `[:pos|:neg fts5-expr]`, or nil when there's nothing to match."
  [word-or-phrase]
  (cond
    ;; no token for the tokenizer to keep, e.g. a lone quote or `-`
    (not (re-find #"[\p{L}\p{N}]" word-or-phrase))
    nil

    (str/starts-with? word-or-phrase "\"")
    (let [phrase (str/trim (str/replace word-or-phrase #"^\"|\"$" ""))]
      (when-not (str/blank? phrase)
        [:pos (fts5-string phrase)]))

    (re-find #"^-\w" word-or-phrase)
    [:neg (fts5-string (subs word-or-phrase 1))]

    :else
    [:pos (fts5-string word-or-phrase)]))

(defn- fts5-clause
  "AND the positive items of a clause together and subtract the negated ones; FTS5's NOT is binary, so a clause
  with nothing positive can't be expressed and matches nothing."
  [items]
  (let [{pos :pos neg :neg} (group-by first items)]
    (when (seq pos)
      (str "(" (str/join " AND " (map second pos)) ")"
           (apply str (for [[_ n] neg] (str " NOT " n)))))))

(defn search-string->fts5-query
  "Translate a search string into an FTS5 query, mirroring the Postgres tsquery the keyword arm uses there (see
  `metabase.search.util/to-tsquery-expr`): space-separated terms are ANDed, `or` separates alternatives,
  `\"quoted phrases\"` match in sequence, `-term` excludes, and the final term matches as a prefix unless the
  input ends in a closing quote. Returns nil when nothing searchable remains."
  [search-string]
  (when-not (str/blank? search-string)
    (let [trimmed   (str/trim search-string)
          complete? (not (str/ends-with? trimmed "\""))
          clauses   (->> (re-seq #"\"[^\"]*(?:\"|$)|[^\s\"]+|\s+" (u/lower-case-en trimmed))
                         (remove str/blank?)
                         (partition-by #{"or"})
                         (remove #(= (first %) "or"))
                         (map #(into [] (comp (remove #{"and"}) (keep fts5-item)) %))
                         (remove empty?)
                         vec)
          ;; the prefix completion targets the final term, as in the tsquery version
          clauses   (if (and complete? (seq clauses) (= :pos (first (peek (peek clauses)))))
                      (update clauses (dec (count clauses))
                              (fn [items] (update items (dec (count items)) #(update % 1 str "*"))))
                      clauses)]
      (some->> (keep fts5-clause clauses)
               seq
               (str/join " OR ")))))

;;; ------------------------------------------------ User functions ------------------------------------------------

;; org.sqlite.Function's accessors are protected, and a Clojure proxy can't reach protected members, so they're
;; called through accessible Method handles instead.
(defn- function-method ^Method [method-name & param-types]
  (doto (.getDeclaredMethod Function method-name (into-array Class param-types))
    (.setAccessible true)))

(def ^:private ^Method m-args         (function-method "args"))
(def ^:private ^Method m-value-type   (function-method "value_type" Integer/TYPE))
(def ^:private ^Method m-value-blob   (function-method "value_blob" Integer/TYPE))
(def ^:private ^Method m-value-text   (function-method "value_text" Integer/TYPE))
(def ^:private ^Method m-value-double (function-method "value_double" Integer/TYPE))
(def ^:private ^Method m-value-long   (function-method "value_long" Integer/TYPE))
(def ^:private ^Method m-result-null  (function-method "result"))
(def ^:private ^Method m-result-text  (function-method "result" String))
(def ^:private ^Method m-result-long  (function-method "result" Long/TYPE))
(def ^:private ^Method m-result-dbl   (function-method "result" Double/TYPE))

;; sqlite3 fundamental datatype codes, as returned by value_type
(def ^:private sqlite-integer 1)
(def ^:private sqlite-float 2)
(def ^:private sqlite-null 5)

(defn- invoke [^Method m ^Function f & args]
  (.invoke m f (object-array args)))

(defn- arg-count ^long [f] (long (invoke m-args f)))

(defn- arg-value
  "Argument `i` as a Clojure value: nil, Long, Double or String."
  [f i]
  (let [t (long (invoke m-value-type f (int i)))]
    (cond
      (= t sqlite-null)    nil
      (= t sqlite-integer) (invoke m-value-long f (int i))
      (= t sqlite-float)   (invoke m-value-double f (int i))
      :else                (invoke m-value-text f (int i)))))

(defn- result!
  "Set `f`'s result to the Clojure value `v`."
  [f v]
  (cond
    (nil? v)     (invoke m-result-null f)
    (integer? v) (invoke m-result-long f (long v))
    (number? v)  (invoke m-result-dbl f (double v))
    :else        (invoke m-result-text f (str v))))

(defn- sql-function
  "An `org.sqlite.Function` whose result is `(f function)`, where `f` reads the call's arguments off `function`."
  ^Function [f]
  (proxy [Function] []
    (xFunc []
      (result! this (f this)))))

(defn- clock-timestamp [_function]
  (now-text))

(defn- vec-distance-cosine [function]
  (let [a (invoke m-value-blob function (int 0))
        b (invoke m-value-blob function (int 1))]
    (when (and a b)
      (let [d (cosine-distance a b)]
        (when-not (Double/isNaN d) d)))))

(defn- extreme
  "`greatest`/`least` over the call's non-NULL arguments, keeping the one `pick` prefers."
  [pick]
  (fn [function]
    (let [vals (keep #(arg-value function %) (range (arg-count function)))]
      (when (seq vals)
        (reduce pick (first vals) (rest vals))))))

(defn- regexp-replace [function]
  (let [s       (arg-value function 0)
        pattern (arg-value function 1)
        repl    (arg-value function 2)
        flags   (when (> (arg-count function) 3) (arg-value function 3))]
    (when (and s pattern repl)
      (let [m (.matcher (Pattern/compile (str pattern)) (str s))
            r (str/replace (str repl) "$" "\\$")]
        (if (and flags (str/includes? (str flags) "g"))
          (.replaceAll m r)
          (.replaceFirst m r))))))

(defn- compare-values [pick]
  (fn [a b]
    (let [c (if (and (number? a) (number? b)) (compare (double a) (double b)) (compare (str a) (str b)))]
      (if (pick c) a b))))

(defn- register-functions!
  "Register the Postgres-compatibility user functions (see the ns docstring) on a raw SQLite connection."
  [^Connection conn native-vec?]
  (Function/create conn "clock_timestamp" (sql-function clock-timestamp))
  (Function/create conn "now" (sql-function clock-timestamp))
  (Function/create conn "greatest" (sql-function (extreme (compare-values pos?))))
  (Function/create conn "least" (sql-function (extreme (compare-values neg?))))
  (Function/create conn "regexp_replace" (sql-function regexp-replace))
  (when-not native-vec?
    (Function/create conn "vec_distance_cosine" (sql-function vec-distance-cosine))))

;;; ------------------------------------------------ JDBC adapter ------------------------------------------------
;;
;; The module passes timestamps around as java.sql.Timestamp/Instant and reads back what pgjdbc returns: Timestamps,
;; Booleans and Longs for aggregates. Rather than convert at every call site, each SQLite connection is wrapped so
;; that it behaves the same way:
;;   binding    Timestamp, Date, Instant, OffsetDateTime and ZonedDateTime bind as [[->timestamp-text]], LocalDate
;;              as `yyyy-MM-dd`
;;   reading    columns declared TIMESTAMP read as Timestamp and BOOLEAN as Boolean; expression columns (no declared
;;              type, e.g. `clock_timestamp()` or `count(*)`) read as Timestamp when they hold timestamp text, and
;;              as Long when they hold an integer

(def ^:private timestamp-text-pattern
  #"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z")

(def ^:private ^Method m-column-decl-type
  (doto (.getDeclaredMethod org.sqlite.jdbc3.JDBC3ResultSet "getColumnDeclType" (into-array Class [Integer/TYPE]))
    (.setAccessible true)))

(defn- param-value
  "The value to bind in place of `v`: timestamp text for any date-time, otherwise `v` itself."
  [v]
  (cond
    (instance? LocalDate v)                       (str v)
    (or (instance? Date v)
        (instance? Instant v)
        (instance? OffsetDateTime v)
        (instance? ZonedDateTime v))              (->timestamp-text v)
    :else                                         v))

(defn- read-value
  "`v`, read from a column of declared type `decl-type` (nil for an expression), as pgjdbc would return it."
  [decl-type v]
  (let [decl-type (some-> decl-type u/upper-case-en)]
    (cond
      (nil? v)
      nil

      (and (string? v)
           (if decl-type
             (str/starts-with? decl-type "TIMESTAMP")
             (re-matches timestamp-text-pattern v)))
      (Timestamp/from (Instant/parse v))

      (and (= decl-type "BOOLEAN") (number? v))
      (not (zero? (long v)))

      (and (nil? decl-type) (instance? Integer v))
      (long v)

      :else
      v)))

(defn- invoke-target
  "Call `method` on `target`, rethrowing what it throws rather than the reflective wrapper."
  [target ^Method method args]
  (try
    (.invoke method target args)
    (catch java.lang.reflect.InvocationTargetException e
      (throw (.getCause e)))))

(defn- jdbc-proxy
  "A `iface` proxy over `target` whose calls go to `(handle target method args)`."
  [^Class iface target handle]
  (java.lang.reflect.Proxy/newProxyInstance
   (.getClassLoader iface)
   (into-array Class [iface])
   (reify java.lang.reflect.InvocationHandler
     (invoke [_ _ method args]
       (handle target method args)))))

(defn- wrap-result-set
  [^java.sql.ResultSet rs]
  (let [decl-types (atom {})
        decl-type  (fn [^long i]
                     (if (contains? @decl-types i)
                       (@decl-types i)
                       (let [t (.invoke m-column-decl-type rs (object-array [(int i)]))]
                         (swap! decl-types assoc i t)
                         t)))]
    (jdbc-proxy java.sql.ResultSet rs
                (fn [target ^Method method args]
                  (let [result (invoke-target target method args)]
                    (if (and (= "getObject" (.getName method)) (= 1 (alength ^objects args)))
                      (let [arg (aget ^objects args 0)
                            i   (if (string? arg) (.findColumn rs ^String arg) (long arg))]
                        (read-value (decl-type i) result))
                      result))))))

(def ^:private result-set-methods #{"executeQuery" "getResultSet" "getGeneratedKeys"})

(defn- wrap-statement
  [^Class iface stmt]
  (jdbc-proxy iface stmt
              (fn [target ^Method method args]
                (let [method-name (.getName method)]
                  (cond
                    (and (#{"setObject" "setTimestamp" "setDate"} method-name)
                         (instance? java.sql.PreparedStatement target))
                    (let [v (param-value (aget ^objects args 1))]
                      (if (string? v)
                        (.setString ^java.sql.PreparedStatement target (int (aget ^objects args 0)) ^String v)
                        (invoke-target target method args)))

                    (result-set-methods method-name)
                    (some-> (invoke-target target method args) wrap-result-set)

                    :else
                    (invoke-target target method args))))))

(defn- wrap-connection
  "Wrap a raw SQLite connection in the adapter described above."
  ^Connection [^Connection conn]
  (jdbc-proxy Connection conn
              (fn [target ^Method method args]
                (let [result (invoke-target target method args)]
                  (case (.getName method)
                    "prepareStatement" (wrap-statement java.sql.PreparedStatement result)
                    "createStatement"  (wrap-statement java.sql.Statement result)
                    result)))))

;;; ------------------------------------------------- Data source --------------------------------------------------

(def ^:private sqlite-pragmas
  "Connection settings. WAL lets the indexer write while searches read; the IMMEDIATE transaction mode takes the
  write lock at BEGIN, so a transaction that reads before writing waits on `busy_timeout` rather than failing
  with SQLITE_BUSY on lock upgrade."
  {:journal-mode     SQLiteConfig$JournalMode/WAL
   :synchronous      SQLiteConfig$SynchronousMode/NORMAL
   :busy-timeout-ms  30000
   :transaction-mode SQLiteConfig$TransactionMode/IMMEDIATE
   :cache-size-kib   65536
   :mmap-size-bytes  (* 256 1024 1024)})

(defn- sqlite-config ^SQLiteConfig []
  (let [{:keys [^SQLiteConfig$JournalMode journal-mode ^SQLiteConfig$SynchronousMode synchronous busy-timeout-ms
                ^SQLiteConfig$TransactionMode transaction-mode cache-size-kib mmap-size-bytes]} sqlite-pragmas]
    (doto (SQLiteConfig.)
      (.setJournalMode journal-mode)
      (.setSynchronous synchronous)
      (.setBusyTimeout (int busy-timeout-ms))
      (.setTransactionMode transaction-mode)
      (.setTempStore SQLiteConfig$TempStore/MEMORY)
      ;; negative cache_size is in KiB
      (.setCacheSize (int (- cache-size-kib)))
      (.setPragma SQLiteConfig$Pragma/MMAP_SIZE (str mmap-size-bytes))
      (.enableLoadExtension (not (str/blank? vec-extension-path))))))

(defn- init-connection!
  "Load sqlite-vec when configured, register the user functions on a freshly opened connection, and wrap it in the
  JDBC adapter."
  ^Connection [^Connection conn]
  (let [native-vec? (not (str/blank? vec-extension-path))]
    (when native-vec?
      (jdbc/execute! conn ["SELECT load_extension(?)" vec-extension-path]))
    (register-functions! conn native-vec?)
    (wrap-connection conn)))

(defn- unpooled-data-source
  "A SQLite DataSource over `path` whose every new connection is prepared by [[init-connection!]].
  Delegates rather than proxying SQLiteDataSource: `proxy-super` briefly unbinds the override, so connections c3p0
  opens concurrently could slip past it."
  ^DataSource [path]
  (let [inner (doto (SQLiteDataSource. (sqlite-config))
                (.setUrl (str "jdbc:sqlite:" path)))]
    (reify DataSource
      (getConnection [_] (init-connection! (.getConnection inner)))
      (getConnection [_ user password] (init-connection! (.getConnection inner user password)))
      (getLogWriter [_] (.getLogWriter inner))
      (setLogWriter [_ w] (.setLogWriter inner w))
      (getLoginTimeout [_] (.getLoginTimeout inner))
      (setLoginTimeout [_ s] (.setLoginTimeout inner s))
      (getParentLogger [_] (.getParentLogger inner))
      (unwrap [_ iface] (.unwrap inner iface))
      (isWrapperFor [_ iface] (.isWrapperFor inner iface)))))

(def ^:private pool-props
  {"minPoolSize"                  1
   "initialPoolSize"              1
   "maxPoolSize"                  8
   "acquireIncrement"             1
   "checkoutTimeout"              30000
   "maxIdleTimeExcessConnections" (* 10 60)
   "dataSourceName"               "metabase-semantic-search-sqlite"})

(defn pooled-data-source
  "Open the SQLite store at `path` behind a c3p0 pool, creating the file and its parent directories if needed."
  [path]
  (let [file (io/file path)]
    (some-> (.getParentFile file) .mkdirs)
    (log/infof "Opening semantic search SQLite store at %s%s" (.getAbsolutePath file)
               (if (str/blank? vec-extension-path) "" (str " with sqlite-vec from " vec-extension-path)))
    (DataSources/pooledDataSource (unpooled-data-source path)
                                  (connection-pool/map->properties pool-props))))
