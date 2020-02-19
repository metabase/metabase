(ns metabase.query-processor.middleware.cache-test
  "Tests for the Query Processor cache."
  (:require [clojure.core.async :as a]
            [clojure.data.csv :as csv]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.models.query-cache :refer [QueryCache]]
            [metabase.query-processor
             [streaming :as qp.streaming]
             [util :as qputil]]
            [metabase.query-processor.middleware.cache :as cache]
            [metabase.query-processor.middleware.cache-backend.interface :as i]
            [metabase.query-processor.middleware.cache.impl :as impl]
            [metabase.test.fixtures :as fixtures]
            [toucan.db :as db]))

(defn- do-with-cleared-cache [thunk]
  (db/simple-delete! QueryCache)
  (testing "with cleared cache\n"
    (thunk)))

(def ^:private save-chan* (atom nil))
(def ^:private purge-chan* (atom nil))

(defn- test-backend []
  (let [db-backend (i/cache-backend :db)]
    (reify i/CacheBackend
      (cached-results [_ query-hash max-age-seconds f]
        (i/cached-results db-backend query-hash max-age-seconds f))

      (save-results! [_ query-hash results]
        (i/save-results! db-backend query-hash results)
        (some-> @save-chan* (a/>!! ::save)))

      (purge-old-entries! [_ max-age-seconds]
        (i/purge-old-entries! db-backend max-age-seconds)
        (some-> @purge-chan* (a/>!! ::purge))))))

(defn- do-with-test-backend [thunk]
  (binding [cache/*backend* (test-backend)]
    (testing "with test backend\n"
      (thunk))))

(defn- do-with-caching-enbaled-settings [thunk]
  (mt/with-temporary-setting-values [enable-query-caching  true
                                     query-caching-max-ttl 60
                                     query-caching-min-ttl 0]
    (thunk)))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each do-with-cleared-cache do-with-test-backend do-with-caching-enbaled-settings)

(deftest is-cacheable-test
  (testing "something is-cacheable? if it includes a cach_ttl and the caching setting is enabled"
    (doseq [enable-caching? [true false]
            cache-ttl       [100 nil]
            :let            [expected (boolean (and enable-caching? cache-ttl))]]
      (mt/with-temporary-setting-values [enable-query-caching enable-caching?]
        (testing (format "cache ttl = %s" (pr-str cache-ttl))
          (is (= expected
                 (boolean (#'cache/is-cacheable? {:cache-ttl cache-ttl})))))))))

(defn- cached? [result]
  (if (:cached result)
    :cached
    :not-cached))

(def ^:private ^:dynamic ^Integer *query-execution-delay-ms* 10)

(defn- test-query [query-kvs]
  (merge {:cache-ttl 60, :query :abc} query-kvs))

(defn- run-query* [& {:as query-kvs}]
  (:metadata
   (mt/test-qp-middleware
    cache/maybe-return-cached-results
    (test-query query-kvs)
    {}
    [[:toucan      71]
     [:bald-eagle  92]
     [:hummingbird 11]
     [:owl         10]
     [:chicken     69]
     [:robin       96]
     [:osprey      72]
     [:flamingo    70]]
    {:timeout 2000
     :run     (fn []
                (Thread/sleep *query-execution-delay-ms*))})))

(defn- run-query [& args]
  (cached? (apply run-query* args)))

(defn- do-wait-for-save
  "Run `thunk`, then wait for cached results to either be saved or for an Exception to be thrown during saving."
  [expected-result thunk]
  (mt/with-open-channels [save-chan (a/promise-chan)]
    (let [orig @save-chan*]
      (try
        (reset! save-chan* save-chan)
        (let [orig impl/serialize-async]
          (with-redefs [impl/serialize-async (fn [& args]
                                               (u/prog1 (apply orig args)
                                                 (a/go
                                                   (let [result (a/<! (:out-chan <>))]
                                                     (when (instance? Throwable result)
                                                       (a/>!! save-chan (or (:type (ex-data result))
                                                                            ::exception)))))))]
            (u/prog1 (thunk)
              (is (= expected-result
                     (mt/wait-for-result save-chan 500))))))
        (finally
          (reset! save-chan* orig))))))

(defmacro ^:private wait-for-save-result {:style/indent 1} [expected-result & body]
  `(do-wait-for-save ~expected-result (fn [] ~@body)))

(defmacro ^:private wait-for-save {:style/indent 0} [& body]
  `(wait-for-save-result ::save ~@body))

(defn- do-wait-for-purge [expected-result thunk]
  (mt/with-open-channels [purge-chan (a/promise-chan)]
    (let [orig @purge-chan*]
      (try
        (reset! purge-chan* purge-chan)
        (u/prog1 (thunk)
          (is (= expected-result
                 (mt/wait-for-result purge-chan 500))))
        (finally (reset! purge-chan* orig))))))

(defmacro ^:private wait-for-purge-result {:style/indent 1} [expected-result & body]
  `(do-wait-for-purge ~expected-result (fn [] ~@body)))

(defmacro ^:private wait-for-purge {:style/indent 0} [& body]
  `(wait-for-purge-result ::purge ~@body))

(defn- cacheable? [& {:as query-kvs}]
  (boolean (#'cache/is-cacheable? (merge {:cache-ttl 60, :query :abc} query-kvs))))

(deftest empty-cache-test
  (testing "if there's nothing in the cache, cached results should *not* be returned"
    (is (= :not-cached
           (run-query)))))

(deftest return-cached-results-test
  (testing "if we run the query twice, the second run should return cached results"
    (is (= true
           (cacheable?)))
    (wait-for-save
      (run-query))
    (is (= :cached
           (run-query)))))

(deftest expired-results-test
  (testing "If cached resutls are past their TTL, the cached results shouldn't be returned"
    (wait-for-save
      (run-query :cache-ttl 0.1))
    (Thread/sleep 200)
    (is (= :not-cached
           (run-query :cache-ttl 0.1)))))

(deftest ignore-valid-results-when-caching-is-disabled-test
  (testing "if caching is disabled then cache shouldn't be used even if there's something valid in there"
    (wait-for-save
      (run-query))
    (mt/with-temporary-setting-values [enable-query-caching false]
      (is (= false
             (cacheable?)))
      (is (= :not-cached
             (run-query))))))

(deftest max-kb-test
  (testing "check that `query-caching-max-kb` is respected and queries aren't cached if they're past the threshold"
    (mt/with-temporary-setting-values [query-caching-max-kb 0]
      (wait-for-save-result ::impl/max-bytes
        (run-query))
      (is (= :not-cached
             (run-query))))))

(deftest max-ttl-test
  (testing (str "Check that `query-caching-max-ttl` is respected. Whenever a new query is cached the cache should "
                "evict any entries older that `query-caching-max-ttl`. Set max-ttl to 100 ms, run query `:abc`, "
                "then wait 200 ms, and run `:def`. This should trigger the cache flush for entries past "
                "`:max-ttl`; and the cached entry for `:abc` should be deleted. Running `:abc` a subsequent time "
                "should not return cached results")
    (mt/with-temporary-setting-values [query-caching-max-ttl 0.1]
      (run-query)
      (Thread/sleep 200)
      (wait-for-purge
        (run-query, :query :def))
      (is (= :not-cached
             (run-query))))))

(deftest ignore-cached-results-test
  (testing "check that *ignore-cached-results* is respected when returning results..."
    (wait-for-save
      (run-query))
    (binding [cache/*ignore-cached-results* true]
      (is (= :not-cached
             (run-query))))))

(deftest ignore-cached-results-should-still-save-test
  (testing "...but if it's set those results should still be cached for next time."
    (binding [cache/*ignore-cached-results* true]
      (is (= true
             (cacheable?)))
      (wait-for-save
        (run-query)))
    (is (= :cached
           (run-query)))))

(deftest min-ttl-test
  (testing "if the cache takes less than the min TTL to execute, it shouldn't be cached"
    (mt/with-temporary-setting-values [query-caching-min-ttl 60]
      (wait-for-save-result :metabase.test.util.async/timed-out
        (run-query))
      (is (= :not-cached
             (run-query)))))

  (testing "...but if it takes *longer* than the min TTL, it should be cached"
    (mt/with-temporary-setting-values [query-caching-min-ttl 0.1]
      (binding [*query-execution-delay-ms* 120]
        (wait-for-save
          (run-query))
        (is (= :cached
               (run-query)))))))

(deftest invalid-cache-entry-test
  (testing "We should handle invalid cache entries gracefully"
    (wait-for-save
      (run-query))
    (let [query-hash (qputil/query-hash (test-query nil))]
      (is (= true
             (i/cached-results cache/*backend* query-hash 100
               (fn respond [is]
                 (when is
                   true))))
          "Cached results should exist")
      (i/save-results! cache/*backend* query-hash (byte-array [0 0 0]))
      (is (= :not-cached
             (mt/suppress-output
               (run-query)))
          "Invalid cache entry should be handled gracefully"))))

(deftest metadata-test
  (testing "Verify that correct metadata about caching such as `:updated_at` and `:cached` come back with cached results."
    (mt/with-clock #t "2020-02-19T02:31:07.798Z[UTC]"
      (wait-for-save
        (run-query)))
    (let [result (run-query*)]
      (is (= :cached
             (cached? result)))
      (is (= {:data       {}
              :cached     true
              :updated_at #t "2020-02-19T02:31:07.798Z[UTC]"
              :row_count  8
              :status     :completed}
             result)))))

(deftest e2e-test
  (testing "Test that the caching middleware actually working in the context of the entire QP"
    (let [query (assoc (mt/mbql-query venues {:order-by [[:asc $id]], :limit 5})
                       :cache-ttl 100)]
      (is (= true
             (boolean (#'cache/is-cacheable? query)))
          "Query should be cacheable")
      (mt/with-clock #t "2020-02-19T04:44:26.056Z[UTC]"
        (wait-for-save
          (qp/process-query query)))
      (let [cached-result (qp/process-query query)]
        (is (= {:cached     true
                :updated_at #t "2020-02-19T04:44:26.056Z[UTC]"
                :row_count  5
                :status     :completed}
               (dissoc cached-result :data))
            "Results should be cached")
        ;; remove metadata checksums because they can be different between runs when using an encryption key
        (is (= (-> (qp/process-query (dissoc query :cache-ttl))
                   (m/dissoc-in [:data :results_metadata :checksum]))
               (-> cached-result
                   (dissoc :cached :updated_at)
                   (m/dissoc-in [:data :results_metadata :checksum])))
            "Cached result should be in the same format as the uncached result, except for added keys")))))

(deftest export-test
  (testing "Should be able to cache results streaming as an alternate download format, e.g. csv"
    (let [query (assoc (mt/mbql-query venues {:order-by [[:asc $id]], :limit 6})
                       :cache-ttl 100)]
      (with-open [os (java.io.ByteArrayOutputStream.)]
        (wait-for-save
          (qp/process-query query (qp.streaming/streaming-context :csv os))))
      (is (= true
             (:cached (qp/process-query query)))
          "Results should be cached")
      (let [uncached-results (with-open [ostream (java.io.PipedOutputStream.)
                                         istream (java.io.PipedInputStream. ostream)
                                         reader  (java.io.InputStreamReader. istream)]
                               (qp/process-query (dissoc query :cache-ttl) (qp.streaming/streaming-context :csv ostream))
                               (vec (csv/read-csv reader)))]
        (with-redefs [sql-jdbc.execute/execute-reducible-query (fn [& _]
                                                                 (throw (Exception. "Should be cached!")))]
          (with-open [ostream (java.io.PipedOutputStream.)
                      istream (java.io.PipedInputStream. ostream)
                      reader  (java.io.InputStreamReader. istream)]
            (qp/process-query query (qp.streaming/streaming-context :csv ostream))
            (is (= uncached-results
                   (vec (csv/read-csv reader)))
                "CSV results should match results when caching isn't in play")))))))
