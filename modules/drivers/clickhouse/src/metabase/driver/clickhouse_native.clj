(ns metabase.driver.clickhouse-native
  "ClickHouse Client V2 transport for query execution using RowBinary format.
   Bypasses JDBC for the query hot path, using binary serialization with LZ4
   compression and Apache HttpClient5 connection pooling."
  (:require
   [clojure.string :as str]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (com.clickhouse.client.api Client Client$Builder)
   (com.clickhouse.client.api.data_formats ClickHouseBinaryFormatReader)
   (com.clickhouse.client.api.metadata TableSchema)
   (com.clickhouse.client.api.query QueryResponse QuerySettings)
   (com.clickhouse.data ClickHouseColumn ClickHouseFormat)
   (java.time LocalDate LocalDateTime OffsetDateTime ZonedDateTime)
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private ^:const query-timeout-seconds 60)

;;; ------------------------------------------ Client Management ------------------------------------------

(defn- build-client
  "Create a ClickHouse Client V2 instance from connection details."
  ^Client [{:keys [host port user password dbname ssl]}]
  (let [protocol (if ssl "https" "http")
        host     (let [h (or host "localhost")]
                   ;; Strip http(s):// prefix (legacy compat, same as JDBC path)
                   (cond
                     (str/starts-with? h "http://")  (subs h 7)
                     (str/starts-with? h "https://") (subs h 8)
                     :else h))
        endpoint (str protocol "://" host ":" (or port 8123))]
    (-> (Client$Builder.)
        (.addEndpoint endpoint)
        (.setUsername (or user "default"))
        (.setPassword (or password ""))
        (.setDefaultDatabase (or dbname "default"))
        (.compressServerResponse true)
        (.compressClientRequest true)
        (.build))))

;; Cache clients by database ID for reliable cache identity
(defonce ^:private clients (atom {}))

(defn get-client
  "Get or create a cached Client V2 instance for the given database.
   Uses the database :id as the cache key — connection details are mutable
   (e.g. password rotation) so keying on a subset of them is lossy."
  ^Client [database]
  (let [db-id  (:id database)
        cached (get @clients db-id)]
    (if cached
      cached
      (let [client (build-client (driver.conn/effective-details database))]
        (swap! clients assoc db-id client)
        client))))

(defn invalidate-client!
  "Remove a cached client for `database`, e.g. after connection details change."
  [database]
  (when-let [old-client (get @clients (:id database))]
    (swap! clients dissoc (:id database))
    (try (.close ^Client old-client) (catch Exception _))))

;;; ------------------------------------------ Parameter Substitution ------------------------------------------

(defn- param->sql-literal
  "Convert a Java parameter value to a ClickHouse SQL literal.
   This mirrors what the JDBC driver does internally for HTTP protocol —
   parameters are substituted into the query string before sending."
  [param]
  (cond
    (nil? param)                       "NULL"
    (string? param)                    (str "'" (-> param (str/replace "\\" "\\\\") (str/replace "'" "\\'")) "'")
    (instance? Boolean param)          (if param "true" "false")
    (instance? Number param)           (str param)
    (instance? LocalDate param)        (str "'" param "'")
    (instance? LocalDateTime param)    (str "'" param "'")
    (instance? OffsetDateTime param)   (str "parseDateTimeBestEffort('" param "')")
    (instance? ZonedDateTime param)    (str "parseDateTimeBestEffort('" param "')")
    :else                              (str "'" (-> (str param) (str/replace "\\" "\\\\") (str/replace "'" "\\'")) "'")))

(defn- find-next-placeholder
  "Find the next `?` placeholder in `sql` starting from `pos`, skipping over
   string literals (single-quoted) and comments (-- and /* */).
   Returns the index of the `?` or nil if none found."
  [^String sql ^long pos]
  (let [len (.length sql)]
    (loop [i pos]
      (when (< i len)
        (let [ch (.charAt sql i)]
          (cond
            ;; Single-quoted string literal — skip to closing quote
            (= ch \')
            (recur (loop [j (inc i)]
                     (if (>= j len)
                       j
                       (let [c (.charAt sql j)]
                         (cond
                           ;; Escaped quote '' — skip both
                           (and (= c \') (< (inc j) len) (= (.charAt sql (inc j)) \'))
                           (recur (+ j 2))
                           ;; Backslash escape \' — skip both
                           (and (= c \\) (< (inc j) len))
                           (recur (+ j 2))
                           ;; End of string
                           (= c \')
                           (inc j)
                           :else
                           (recur (inc j)))))))

            ;; Line comment -- skip to end of line
            (and (= ch \-) (< (inc i) len) (= (.charAt sql (inc i)) \-))
            (recur (let [nl (str/index-of sql "\n" i)]
                     (if nl (inc ^long nl) len)))

            ;; Block comment /* */ — skip to closing */
            (and (= ch \/) (< (inc i) len) (= (.charAt sql (inc i)) \*))
            (recur (let [close (str/index-of sql "*/" (+ i 2))]
                     (if close (+ ^long close 2) len)))

            ;; Found a placeholder
            (= ch \?)
            i

            :else
            (recur (inc i))))))))

(defn- substitute-params
  "Replace positional `?` placeholders with literal values, skipping
   placeholders inside string literals and comments.
   ClickHouse's HTTP protocol doesn't support binary parameter binding,
   so the JDBC driver does the same substitution internally."
  ^String [^String sql params]
  (if (empty? params)
    sql
    (let [sb (StringBuilder.)]
      (loop [pos     0
             [p & more] params]
        (if-let [idx (find-next-placeholder sql pos)]
          (do (.append sb (subs sql pos ^long idx))
              (.append sb ^String (param->sql-literal p))
              (recur (inc ^long idx) more))
          (.append sb (subs sql pos))))
      (str sb))))

;;; ------------------------------------------ Column Metadata ------------------------------------------

(defn- column-metadata
  "Build Metabase-compatible column metadata from a ClickHouse TableSchema."
  [^TableSchema schema]
  (mapv (fn [^ClickHouseColumn col]
          (let [orig-type (.getOriginalTypeName col)]
            {:name          (.getColumnName col)
             :database_type orig-type
             :base_type     (sql-jdbc.sync/database-type->base-type
                             :clickhouse
                             (keyword (u/lower-case-en orig-type)))}))
        (.getColumns schema)))

;;; ------------------------------------------ Query Execution ------------------------------------------

(defn execute-native-query
  "Execute a SQL query using the Client V2 binary protocol.
   Calls `respond` with [results-metadata reducible-rows], matching
   the contract of `driver/execute-reducible-query`."
  [database sql params max-rows respond]
  (let [client (get-client database)
        sql    (substitute-params sql params)
        ;; Append LIMIT if max-rows is set and query doesn't already have one.
        ;; Use .setMaxRows on the JDBC side, but for Client V2 we need to inject it.
        ;; Strip comments and string literals before checking for LIMIT to avoid
        ;; false positives from LIMIT appearing inside strings or comments.
        sql    (if (and max-rows (pos? ^long max-rows)
                       (not (re-find #"(?i)\bLIMIT\s+\d"
                                     (-> sql
                                         (str/replace #"'(?:[^'\\]|\\.)*'" " ")     ; strip string literals
                                         (str/replace #"--[^\n]*" " ")              ; strip line comments
                                         (str/replace #"/\*[\s\S]*?\*/" " ")))))    ; strip block comments
                 (str sql "\nLIMIT " max-rows)
                 sql)
        settings (doto (QuerySettings.)
                   (.setFormat ClickHouseFormat/RowBinaryWithNamesAndTypes))]
    (log/debugf "ClickHouse Client V2 query: %.200s" sql)
    (let [^QueryResponse response (.get (.query client sql settings)
                                        query-timeout-seconds TimeUnit/SECONDS)]
      (try
        (let [^ClickHouseBinaryFormatReader reader (.newBinaryFormatReader client response)
              schema          (.getSchema reader)
              cols            (column-metadata schema)
              col-count       (count cols)
              ;; 1-based column indices for the reader
              col-indices     (int-array (mapv inc (range col-count)))
              results-metadata {:cols cols}
              ;; Streaming reducible — rows are read on-demand from the binary reader
              reducible-rows
              (reify clojure.lang.IReduceInit
                (reduce [_ f init]
                  (loop [acc init]
                    (if (.hasNext reader)
                      (let [_   (.next reader)
                            row (let [arr (object-array col-count)]
                                  (dotimes [j col-count]
                                    (aset arr j (.readValue reader (aget col-indices j))))
                                  (vec arr))
                            result (f acc row)]
                        (if (reduced? result)
                          @result
                          (recur result)))
                      acc))))]
          (respond results-metadata reducible-rows))
        (finally
          (.close response))))))
