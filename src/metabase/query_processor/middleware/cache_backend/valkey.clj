(ns metabase.query-processor.middleware.cache-backend.valkey
  "Valkey/Redis-protocol Query Processor cache backend."
  (:require
   [buddy.core.codecs :as codecs]
   [java-time.api :as t]
   [metabase.cache.core :as cache]
   [metabase.config.core :as config]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log])
  (:import
   (io.lettuce.core ClientOptions RedisClient RedisURI ScanArgs ScanCursor SetArgs SocketOptions)
   (io.lettuce.core.api StatefulRedisConnection)
   (io.lettuce.core.api.sync RedisCommands)
   (io.lettuce.core.codec ByteArrayCodec)
   (java.io ByteArrayInputStream Closeable)
   (java.nio.charset StandardCharsets)
   (java.time Duration Instant)
   (java.util HashMap)))

(set! *warn-on-reflection* true)

(def ^:private byte-array-class
  (Class/forName "[B"))

(defn- utf8-bytes
  ^bytes [^String s]
  (.getBytes s StandardCharsets/UTF_8))

(defn- utf8-string
  ^String [^bytes bs]
  (String. bs StandardCharsets/UTF_8))

(defn- hex-hash
  [^bytes b]
  (codecs/bytes->hex b))

(def ^:private ^bytes results-field
  (utf8-bytes "results"))

(def ^:private ^bytes updated-at-field
  (utf8-bytes "updated_at"))

(defn- entry-key-prefix
  ^String [^String key-prefix]
  (str key-prefix "entry:"))

(defn- lease-key-prefix
  ^String [^String key-prefix]
  (str key-prefix "lease:"))

(defn- entry-key
  ^bytes [^String key-prefix ^bytes query-hash]
  (utf8-bytes (str (entry-key-prefix key-prefix) (hex-hash query-hash))))

(defn- lease-key
  ^bytes [^String key-prefix ^bytes query-hash]
  (utf8-bytes (str (lease-key-prefix key-prefix) (hex-hash query-hash))))

(defn- key-array
  [keys]
  (into-array byte-array-class keys))

(defn- long-bytes
  ^bytes [n]
  (utf8-bytes (str n)))

(defn- bytes->instant
  ^Instant [^bytes bs]
  (Instant/ofEpochMilli (Long/parseLong (utf8-string bs))))

(defn- now-ms []
  (t/to-millis-from-epoch (t/instant)))

(defn- max-entry-age-seconds []
  (max 1 (long (Math/ceil (double (cache/query-caching-max-ttl))))))

(defn- make-client
  ^RedisClient []
  (let [command-timeout (Duration/ofMillis (config/config-long :mb-qp-cache-valkey-command-timeout-ms))
        connect-timeout (Duration/ofMillis (config/config-long :mb-qp-cache-valkey-connect-timeout-ms))
        uri             (doto (RedisURI/create ^String (config/config-str :mb-qp-cache-valkey-uri))
                          (.setTimeout command-timeout))
        socket-options  (-> (SocketOptions/builder)
                            (.connectTimeout connect-timeout)
                            (.build))
        client-options  (-> (ClientOptions/builder)
                            (.socketOptions socket-options)
                            (.build))
        client          (RedisClient/create ^RedisURI uri)]
    (.setOptions client client-options)
    client))

(defn- commands
  ^RedisCommands [connection]
  (.sync ^StatefulRedisConnection @connection))

(defn- save-results!
  [commands key-prefix ^bytes query-hash ^bytes results]
  (log/debugf "Caching results for query with hash %s in Valkey." (pr-str (i/short-hex-hash query-hash)))
  (let [final-results (encryption/maybe-encrypt-for-stream results)
        cache-key     (entry-key key-prefix query-hash)
        lease-key     (lease-key key-prefix query-hash)
        timestamp     (long-bytes (now-ms))
        fields        (doto (HashMap.)
                        (.put results-field final-results)
                        (.put updated-at-field timestamp))]
    (.hset ^RedisCommands commands cache-key fields)
    (.expire ^RedisCommands commands cache-key (long (max-entry-age-seconds)))
    (.del ^RedisCommands commands (key-array [lease-key]))
    nil))

(defn- scan-args-for-pattern
  ^ScanArgs [^String pattern]
  (doto (ScanArgs.)
    (.match pattern)
    (.limit 1000)))

(defn- scan-args
  ^ScanArgs [^String key-prefix]
  (scan-args-for-pattern (str (entry-key-prefix key-prefix) "*")))

(defn- purge-old-entries!
  [commands key-prefix max-age-seconds]
  {:pre [(number? max-age-seconds)]}
  (let [cutoff (Instant/ofEpochMilli (- (now-ms) (long (* 1000 max-age-seconds))))
        args   (scan-args key-prefix)]
    (loop [cursor ScanCursor/INITIAL]
      (let [scan-cursor (.scan ^RedisCommands commands cursor args)
            old-keys    (for [cache-key (.getKeys scan-cursor)
                              :let      [updated-at (.hget ^RedisCommands commands cache-key updated-at-field)]
                              :when     (and updated-at (.isBefore (bytes->instant updated-at) cutoff))]
                          cache-key)]
        (when (seq old-keys)
          (.del ^RedisCommands commands (key-array old-keys)))
        (when-not (.isFinished scan-cursor)
          (recur scan-cursor)))))
  nil)

(defn- try-acquire-refresh-lease!
  [commands key-prefix query-hash lease-ms]
  (let [lease-key (lease-key key-prefix query-hash)]
    (when-not (pos? lease-ms)
      (.del ^RedisCommands commands (key-array [lease-key])))
    (boolean
     (.set ^RedisCommands commands
           lease-key
           (utf8-bytes (str (random-uuid)))
           (doto (SetArgs.)
             (.nx)
             (.px (max 1 (long lease-ms))))))))

(defmethod i/cache-backend :valkey
  [_]
  (let [client     (delay (make-client))
        connection (delay (.connect ^RedisClient @client ByteArrayCodec/INSTANCE))
        key-prefix (config/config-str :mb-qp-cache-valkey-key-prefix)]
    (reify i/CacheBackend
      (cached-results [_ query-hash respond]
        (let [commands   (commands connection)
              cache-key  (entry-key key-prefix query-hash)
              results    (.hget ^RedisCommands commands cache-key results-field)
              updated-at (.hget ^RedisCommands commands cache-key updated-at-field)]
          (if (and results updated-at)
            (with-open [is (encryption/maybe-decrypt-stream (ByteArrayInputStream. results))]
              (respond is (bytes->instant updated-at)))
            (respond nil nil))))

      (save-results! [_ query-hash results]
        (save-results! (commands connection) key-prefix query-hash results))

      (purge-old-entries! [_ max-age-seconds]
        (purge-old-entries! (commands connection) key-prefix max-age-seconds))

      (try-acquire-refresh-lease! [_ query-hash lease-ms]
        (try-acquire-refresh-lease! (commands connection) key-prefix query-hash lease-ms))

      Closeable
      (close [_]
        (when (realized? connection)
          (.close ^StatefulRedisConnection @connection))
        (when (realized? client)
          (.shutdown ^RedisClient @client))))))
