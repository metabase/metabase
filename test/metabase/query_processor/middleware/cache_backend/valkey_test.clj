(ns metabase.query-processor.middleware.cache-backend.valkey-test
  "Integration tests for the Valkey Query Processor cache backend.

  These tests use the production Valkey configuration path, which defaults to redis://localhost:6379."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.test :refer :all]
   [metabase.cache.core :as cache]
   [metabase.config.core :as config]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.query-processor.middleware.cache-backend.test-util :as backend.tu]
   [metabase.query-processor.middleware.cache-backend.valkey]
   [metabase.test :as mt]
   [metabase.test.initialize :as initialize]
   [metabase.util.encryption-test :as encryption-test])
  (:import
   (io.lettuce.core RedisClient RedisURI ScanArgs ScanCursor)
   (io.lettuce.core.api StatefulRedisConnection)
   (io.lettuce.core.api.sync RedisCommands)
   (io.lettuce.core.codec ByteArrayCodec)
   (java.io Closeable InputStream)
   (java.nio.charset StandardCharsets)
   (java.time Instant)))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :once (fn [thunk]
                      (initialize/initialize-if-needed! :db)
                      (thunk)))

(def ^:private byte-array-class
  (Class/forName "[B"))

(defn- key-array
  [keys]
  (into-array byte-array-class keys))

(defn- query-hash
  ^bytes [^String s]
  (let [source (.getBytes s StandardCharsets/UTF_8)
        result (byte-array 32)]
    (System/arraycopy source 0 result 0 (min (alength source) (alength result)))
    result))

(defn- cached-result
  [backend query-hash]
  (i/with-cached-results backend query-hash [is updated-at]
                         (when is
                           {:results    (.readAllBytes ^InputStream is)
                            :updated-at updated-at})))

(defn- cached-string
  [backend query-hash]
  (some-> (cached-result backend query-hash) :results codecs/bytes->str))

(defn- scan-args-for-pattern
  ^ScanArgs [^String pattern]
  (doto (ScanArgs.)
    (.match pattern)
    (.limit 1000)))

(defn- delete-matching-test-keys!
  [commands pattern]
  (let [args (scan-args-for-pattern pattern)]
    (loop [cursor ScanCursor/INITIAL]
      (let [scan-cursor (.scan ^RedisCommands commands cursor args)
            keys        (.getKeys scan-cursor)]
        (when (seq keys)
          (.del ^RedisCommands commands (key-array keys)))
        (when-not (.isFinished scan-cursor)
          (recur scan-cursor))))))

(defn- clear-test-prefix!
  [commands prefix]
  (delete-matching-test-keys! commands (str prefix "entry:*"))
  (delete-matching-test-keys! commands (str prefix "lease:*")))

(defn- do-with-valkey-backend!
  [f]
  (let [prefix              (str "metabase:test:qp-cache:" (random-uuid) ":")
        original-config-str config/config-str]
    #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
    (with-redefs [config/config-str (fn [k]
                                      (case (keyword k)
                                        :mb-qp-cache-valkey-key-prefix prefix
                                        (original-config-str k)))]
      (let [client     (RedisClient/create ^RedisURI (RedisURI/create ^String (config/config-str :mb-qp-cache-valkey-uri)))
            connection (.connect ^RedisClient client ByteArrayCodec/INSTANCE)
            commands   (.sync ^StatefulRedisConnection connection)
            backend    (i/cache-backend :valkey)]
        (try
          (clear-test-prefix! commands prefix)
          (f backend)
          (finally
            (try
              (clear-test-prefix! commands prefix)
              (finally
                (.close ^Closeable backend)
                (.close ^StatefulRedisConnection connection)
                (.shutdown ^RedisClient client)))))))))

(deftest ^:mb/once save-read-overwrite-and-binary-test
  (do-with-valkey-backend!
   (fn [backend]
     (encryption-test/with-secret-key nil
       (let [hash-1  (query-hash "valkey-contract-1")
             hash-2  (query-hash "valkey-contract-2")
             binary  (byte-array (map byte (range -32 32)))]
         (testing "Cache miss"
           (is (nil? (cached-result backend hash-1))))
         (i/save-results! backend hash-1 (codecs/to-bytes "cache-value-A"))
         (is (= "cache-value-A"
                (cached-string backend hash-1)))
         (is (instance? Instant (:updated-at (cached-result backend hash-1))))
         (i/save-results! backend hash-1 (codecs/to-bytes "cache-value-B"))
         (is (= "cache-value-B"
                (cached-string backend hash-1)))
         (i/save-results! backend hash-2 binary)
         (is (= (vec binary)
                (vec (:results (cached-result backend hash-2))))))))))

(deftest ^:mb/once query-cache-behavior-test
  (testing "Valkey backend supports the same shared query-cache middleware behavior as the DB backend"
    (do-with-valkey-backend!
     backend.tu/assert-query-cache-behavior!)))

(deftest ^:mb/once ttl-and-purge-test
  (do-with-valkey-backend!
   (fn [backend]
     (encryption-test/with-secret-key nil
       (testing "Entries expire using Valkey's native key TTL"
         #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
         (with-redefs [cache/query-caching-max-ttl (constantly 1)]
           (let [query-hash (query-hash "valkey-ttl")]
             (i/save-results! backend query-hash (codecs/to-bytes "short-lived"))
             (is (= "short-lived"
                    (cached-string backend query-hash)))
             (Thread/sleep 1500)
             (is (nil? (cached-result backend query-hash)))))))
     (encryption-test/with-secret-key nil
       (testing "Manual purge deletes entries older than the supplied age"
         (let [query-hash (query-hash "valkey-purge")]
           (i/save-results! backend query-hash (codecs/to-bytes "old"))
           (Thread/sleep 50)
           (i/purge-old-entries! backend 0)
           (is (nil? (cached-result backend query-hash)))))))))

(deftest ^:mb/once encryption-round-trip-test
  (do-with-valkey-backend!
   (fn [backend]
     (encryption-test/with-secret-key "key1"
       (let [query-hash (query-hash "valkey-encrypted")]
         (i/save-results! backend query-hash (codecs/to-bytes "encrypted-cache-value"))
         (is (= "encrypted-cache-value"
                (cached-string backend query-hash))))))))

(deftest ^:mb/once refresh-lease-test
  (do-with-valkey-backend!
   (fn [backend]
     (let [query-hash (query-hash "valkey-refresh-lease")]
       (testing "Only one concurrent caller wins the refresh lease"
         (let [wins (mt/repeat-concurrently 8 #(i/try-acquire-refresh-lease! backend query-hash 10000))]
           (is (= 1 (count (filter true? wins))))))
       (testing "The lease is held until save-results! releases it"
         (is (false? (i/try-acquire-refresh-lease! backend query-hash 10000)))
         (i/save-results! backend query-hash (codecs/to-bytes "fresh"))
         (is (true? (i/try-acquire-refresh-lease! backend query-hash 10000))))))))
