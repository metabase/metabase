(ns metabase.query-processor.middleware.cache-backend.db-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test])
  (:import
   (java.sql Connection)
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(defn- cache-results
  "Get the stored value from the query_cache"
  ^bytes [^Connection conn]
  (-> (jdbc/query {:connection conn} "select results from query_cache limit 1")
      first
      :results
      byte-array))

(deftest encryption-test
  (testing "With no encryption, cache results should be stored plain text"
    (encryption-test/with-secret-key nil
      (mt/with-temp-empty-app-db [conn :h2]
        (mdb/setup-db! :create-sample-content? false)
        (let [cache-backend (i/cache-backend :db)]
          (i/save-results! cache-backend (codecs/to-bytes "cache-key") (codecs/to-bytes "cache-value"))
          (let [cached (cache-results conn)]
            (is (= "cache-value" (codecs/bytes->str cached))))))))
  (testing "With encryption enabled, cache results should be stored encrypted text"
    (encryption-test/with-secret-key "key1"
      (mt/with-temp-empty-app-db [conn :h2]
        (mdb/setup-db! :create-sample-content? false)
        (let [cache-backend (i/cache-backend :db)]
          (i/save-results! cache-backend (codecs/to-bytes "cache-key") (codecs/to-bytes "cache-value"))
          (let [cached (codecs/bytes->str (cache-results conn))]
            (is (str/starts-with? cached "AES/CBC/PKCS5Padding"))
            (is (not (str/includes? cached "cache-value")))))))))

(deftest save-results-concurrent-race-test
  (testing "Concurrent save-results! calls with the same query hash should not violate the PK constraint (#73770)"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      ;; Real query hashes are 32-byte SHA-256 digests; the query_cache PK is BINARY(32). With a
      ;; shorter hash, H2 pads stored values with zeros, so a subsequent select-by-hash would not
      ;; match — masking the retry logic in update-or-insert!.
      (let [query-hash    (byte-array 32 (map byte (concat (.getBytes "race-test-hash") (repeat 0))))
            results-bytes (codecs/to-bytes "result-bytes")
            ;; Force both threads into the INSERT call simultaneously, so they both attempt to
            ;; insert the same primary key. The latch wraps both t2 insert variants so the race
            ;; is deterministically exercised regardless of which one the implementation uses.
            latch                (CountDownLatch. 2)
            ins-pks-var          (requiring-resolve 'toucan2.core/insert-returning-pk!)
            ins-instances-var    (requiring-resolve 'toucan2.core/insert-returning-instances!)
            orig-ins-pks         @ins-pks-var
            orig-ins-instances   @ins-instances-var
            await-race!          (fn [model]
                                   (when (= model :model/QueryCache)
                                     (.countDown latch)
                                     (.await latch 5 TimeUnit/SECONDS)))
            coordinated-ins-pks  (fn [& args]
                                   (await-race! (first args))
                                   (apply orig-ins-pks args))
            coordinated-ins-inst (fn [& args]
                                   (await-race! (first args))
                                   (apply orig-ins-instances args))
            cache-backend        (i/cache-backend :db)]
        #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
        (with-redefs-fn {ins-pks-var       coordinated-ins-pks
                         ins-instances-var coordinated-ins-inst}
          (fn []
            (mt/with-log-messages-for-level [messages :error]
              (mt/repeat-concurrently 2 #(i/save-results! cache-backend query-hash results-bytes))
              (testing "both threads reached the coordination point (otherwise the race wasn't exercised)"
                (is (zero? (.getCount latch))))
              (testing "no \"Error saving query results to cache.\" should be logged"
                (is (empty? (filter #(some-> % :message (str/includes? "Error saving query results to cache"))
                                    (messages))))))))))))
