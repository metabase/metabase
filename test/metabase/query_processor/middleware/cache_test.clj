(ns metabase.query-processor.middleware.cache-test
  "Tests for the Query Processor cache."
  (:require [buddy.core.codecs :as codecs]
            [clojure.core.async :as a]
            [clojure.data.csv :as csv]
            [clojure.test :refer :all]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [medley.core :as m]
            [metabase
             [public-settings :as public-settings]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.query-processor
             [streaming :as qp.streaming]
             [util :as qputil]]
            [metabase.query-processor.middleware.cache :as cache]
            [metabase.query-processor.middleware.cache-backend.interface :as i]
            [metabase.query-processor.middleware.cache.impl :as impl]
            [metabase.test
             [fixtures :as fixtures]
             [util :as tu]]
            [pretty.core :as pretty]))

(use-fixtures :once (fixtures/initialize :db))

(def ^:private ^:dynamic *save-chan*
  "Gets a message whenever results are saved to the test backend, or if the reducing function stops serializing results
  because of an Exception or if the byte threshold is passed."
  nil)

(def ^:private ^:dynamic *purge-chan*
  "Gets a message whenever old entries are purged from the test backend."
  nil)

(defn- test-backend
  "In in-memory cache backend implementation."
  [save-chan purge-chan]
  (let [store (atom nil)]
    (reify
      pretty/PrettyPrintable
      (pretty [_]
        (str "\n"
             (metabase.util/pprint-to-str 'blue
               (for [[hash {:keys [created]}] @store]
                 [hash (metabase.util/format-nanoseconds (.getNano (t/duration created (t/instant))))]))))

      i/CacheBackend
      (cached-results [this query-hash max-age-seconds respond]
        (let [hex-hash (codecs/bytes->hex query-hash)]
          (log/tracef "Fetch results for %s store: %s" hex-hash this)
          (if-let [^bytes results (when-let [{:keys [created results]} (some (fn [[hash entry]]
                                                                               (when (= hash hex-hash)
                                                                                 entry))
                                                                             @store)]
                                    (when (t/after? created (t/minus (t/instant) (t/seconds max-age-seconds)))
                                      results))]
            (with-open [is (java.io.ByteArrayInputStream. results)]
              (respond is))
            (respond nil))))

      (save-results! [this query-hash results]
        (let [hex-hash (buddy.core.codecs/bytes->hex query-hash)]
          (swap! store assoc hex-hash {:results results
                                       :created (t/instant)})
          (log/tracef "Save results for %s --> store: %s" hex-hash this))
        (a/>!! save-chan results))

      (purge-old-entries! [this max-age-seconds]
        (swap! store (fn [store]
                       (into {} (filter (fn [[_ {:keys [created]}]]
                                          (t/after? created (t/minus (t/instant) (t/seconds max-age-seconds))))
                                        store))))
        (log/tracef "Purge old entries --> store: %s" this)
        (a/>!! purge-chan ::purge)))))

(defn- do-with-mock-cache [f]
  (mt/with-open-channels [save-chan  (a/chan 1)
                          purge-chan (a/chan 1)]
    (mt/with-temporary-setting-values [enable-query-caching  true
                                       query-caching-max-ttl 60
                                       query-caching-min-ttl 0]
      (binding [cache/*backend* (test-backend save-chan purge-chan)
                *save-chan*     save-chan
                *purge-chan*    purge-chan]
        (let [orig (var-get #'cache/cache-results-async!)]
          (with-redefs [cache/cache-results-async! (fn [hash out-chan]
                                                     (a/go
                                                       ;; if `save-results!` isn't going to get called because
                                                       ;; `out-chan` isn't a byte array then forward the result to
                                                       ;; `save-chan` so it always gets a value
                                                       (let [result (a/<! out-chan)]
                                                         (when-not (bytes? result)
                                                           (a/>!! save-chan result))))
                                                     (orig hash out-chan))]
            (f {:save-chan save-chan, :purge-chan purge-chan})))))))

(defmacro with-mock-cache [[& bindings] & body]
  `(do-with-mock-cache (fn [{:keys [~@bindings]}] ~@body)))

(def ^:private ^:dynamic ^Integer *query-execution-delay-ms* 10)

(defn- test-query [query-kvs]
  (merge {:cache-ttl 60, :query :abc} query-kvs))

(defn- run-query* [& {:as query-kvs}]
  ;; clear out stale values in save/purge channels
  (while (a/poll! *save-chan*))
  (while (a/poll! *purge-chan*))
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
  (let [result (apply run-query* args)]
    (is (= :completed
           (:status result)))
    (if (:cached result)
      :cached
      :not-cached)))

(defn- cacheable? [& {:as query-kvs}]
  (boolean (#'cache/is-cacheable? (merge {:cache-ttl 60, :query :abc} query-kvs))))

(deftest is-cacheable-test
  (testing "something is-cacheable? if it includes a cach_ttl and the caching setting is enabled"
    (with-mock-cache []
      (doseq [enable-caching? [true false]
              cache-ttl       [100 nil]
              :let            [expected (boolean (and enable-caching? cache-ttl))]]
        (mt/with-temporary-setting-values [enable-query-caching enable-caching?]
          (testing (format "cache ttl = %s" (pr-str cache-ttl))
            (is (= expected
                   (boolean (#'cache/is-cacheable? {:cache-ttl cache-ttl}))))))))))

(deftest empty-cache-test
  (testing "if there's nothing in the cache, cached results should *not* be returned"
    (with-mock-cache []
      (is (= :not-cached
             (run-query))))))

(deftest return-cached-results-test
  (testing "if we run the query twice, the second run should return cached results"
    (with-mock-cache [save-chan]
      (is (= true
             (cacheable?)))
      (run-query)
      (mt/wait-for-result save-chan)
      (is (= :cached
             (run-query))))))

(deftest expired-results-test
  (testing "If cached resutls are past their TTL, the cached results shouldn't be returned"
    (with-mock-cache [save-chan]
      (run-query :cache-ttl 0.1)
      (mt/wait-for-result save-chan)
      (Thread/sleep 200)
      (is (= :not-cached
             (run-query :cache-ttl 0.1))))))

(deftest ignore-valid-results-when-caching-is-disabled-test
  (testing "if caching is disabled then cache shouldn't be used even if there's something valid in there"
    (with-mock-cache [save-chan]
      (run-query)
      (mt/wait-for-result save-chan)
      (mt/with-temporary-setting-values [enable-query-caching false]
        (is (= false
               (cacheable?)))
        (is (= :not-cached
               (run-query)))))))

(deftest max-kb-test
  (testing "check that `query-caching-max-kb` is respected and queries aren't cached if they're past the threshold"
    (with-mock-cache [save-chan]
      (mt/with-temporary-setting-values [query-caching-max-kb 0]
        (run-query)
        (let [result (mt/wait-for-result save-chan)]
          (is (instance? clojure.lang.ExceptionInfo result))
          (is (= {:type ::impl/max-bytes}
                 (ex-data result))))
        (is (= :not-cached
               (run-query)))))))

(deftest max-ttl-test
  (testing (str "Check that `query-caching-max-ttl` is respected. Whenever a new query is cached the cache should "
                "evict any entries older that `query-caching-max-ttl`. Set max-ttl to 100 ms, run query `:abc`, "
                "then wait 200 ms, and run `:def`. This should trigger the cache flush for entries past "
                "`:max-ttl`; and the cached entry for `:abc` should be deleted. Running `:abc` a subsequent time "
                "should not return cached results")
    (with-mock-cache [purge-chan]
      (mt/with-temporary-setting-values [query-caching-max-ttl 0.1]
        (run-query)
        (mt/wait-for-result purge-chan)
        (Thread/sleep 200)
        (run-query :query :def)
        (mt/wait-for-result purge-chan)
        (is (= :not-cached
               (run-query)))))))

(deftest ignore-cached-results-test
  (testing "check that *ignore-cached-results* is respected when returning results..."
    (with-mock-cache [save-chan]
      (run-query)
      (mt/wait-for-result save-chan)
      (binding [cache/*ignore-cached-results* true]
        (is (= :not-cached
               (run-query)))))))

(deftest ignore-cached-results-should-still-save-test
  (testing "...but if it's set those results should still be cached for next time."
    (with-mock-cache [save-chan]
      (binding [cache/*ignore-cached-results* true]
        (is (= true
               (cacheable?)))
        (run-query)
        (mt/wait-for-result save-chan))
      (is (= :cached
             (run-query))))))

(deftest min-ttl-test
  (testing "if the cache takes less than the min TTL to execute, it shouldn't be cached"
    (with-mock-cache [save-chan]
      (mt/with-temporary-setting-values [query-caching-min-ttl 60]
        (run-query)
        (is (= :metabase.test.util.async/timed-out
               (mt/wait-for-result save-chan)))
        (is (= :not-cached
               (run-query))))))

  (testing "...but if it takes *longer* than the min TTL, it should be cached"
    (with-mock-cache [save-chan]
      (mt/with-temporary-setting-values [query-caching-min-ttl 0.1]
        (binding [*query-execution-delay-ms* 120]
          (run-query)
          (mt/wait-for-result save-chan)
          (is (= :cached
                 (run-query))))))))

(deftest invalid-cache-entry-test
  (testing "We should handle invalid cache entries gracefully"
    (with-mock-cache [save-chan]
      (run-query)
      (mt/wait-for-result save-chan)
      (let [query-hash (qputil/query-hash (test-query nil))]
        (testing "Cached results should exist"
          (is (= true
                 (i/cached-results cache/*backend* query-hash 100
                   (fn respond [input-stream]
                     (some? input-stream))))))
        (i/save-results! cache/*backend* query-hash (byte-array [0 0 0]))
        (testing "Invalid cache entry should be handled gracefully"
          (mt/suppress-output
            (is (= :not-cached
                   (run-query)))))))))

(deftest metadata-test
  (testing "Verify that correct metadata about caching such as `:updated_at` and `:cached` come back with cached results."
    (with-mock-cache [save-chan]
      (mt/with-clock #t "2020-02-19T02:31:07.798Z[UTC]"
        (run-query)
        (mt/wait-for-result save-chan)
        (let [result (run-query*)]
          (is (= true
                 (:cached result)))
          (is (= {:data       {}
                  :cached     true
                  :updated_at #t "2020-02-19T02:31:07.798Z[UTC]"
                  :row_count  8
                  :status     :completed}
                 result)))))))

(deftest e2e-test
  (testing "Test that the caching middleware actually working in the context of the entire QP"
    (doseq [query [(mt/mbql-query venues {:order-by [[:asc $id]], :limit 5})
                   (mt/native-query {:query "SELECT * FROM VENUES ORDER BY ID ASC LIMIT 5;"})]]
      (with-mock-cache [save-chan]
        (let [query (assoc query :cache-ttl 100)]
          (testing (format "query = %s" (pr-str query))
            (is (= true
                   (boolean (#'cache/is-cacheable? query)))
                "Query should be cacheable")

            (mt/with-clock #t "2020-02-19T04:44:26.056Z[UTC]"
              (let [original-result (qp/process-query query)
                    ;; clear any existing values in the `save-chan`
                    _               (while (a/poll! save-chan))
                    _               (mt/wait-for-result save-chan)
                    cached-result   (qp/process-query query)]
                (is (= {:cached     true
                        :updated_at #t "2020-02-19T04:44:26.056Z[UTC]"
                        :row_count  5
                        :status     :completed}
                       (dissoc cached-result :data))
                    "Results should be cached")
                ;; remove metadata checksums because they can be different between runs when using an encryption key
                (is (= (-> original-result
                           (m/dissoc-in [:data :results_metadata :checksum]))
                       (-> cached-result
                           (dissoc :cached :updated_at)
                           (m/dissoc-in [:data :results_metadata :checksum])))
                    "Cached result should be in the same format as the uncached result, except for added keys")))))))))

(deftest insights-from-cache-test
  (testing "Insights should work on cahced results (#12556)"
    (with-mock-cache [save-chan]
      (let [query (-> checkins
                      (mt/mbql-query {:breakout    [[:datetime-field (mt/id :checkins :date) :month]]
                                      :aggregation [[:count]]})
                      (assoc :cache-ttl 100))]
        (qp/process-query query)
        ;; clear any existing values in the `save-chan`
        (while (a/poll! save-chan))
        (mt/wait-for-result save-chan)
        (is (= {:previous-value 24
                :unit           :month
                :offset         -45.27
                :last-change    -0.46
                :last-value     13
                :col            "count"}
               (tu/round-all-decimals 2 (-> query
                                            qp/process-query
                                            :data
                                            :insights
                                            first
                                            (dissoc :best-fit :slope)))))))))

(deftest export-test
  (testing "Should be able to cache results streaming as an alternate download format, e.g. csv"
    (with-mock-cache [save-chan]
      (let [query (assoc (mt/mbql-query venues {:order-by [[:asc $id]], :limit 6})
                         :cache-ttl 100)]
        (with-open [os (java.io.ByteArrayOutputStream.)]
          (qp/process-query query (qp.streaming/streaming-context :csv os))
          (mt/wait-for-result save-chan))
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
                  "CSV results should match results when caching isn't in play"))))))))

(deftest caching-across-different-formats-test
  (testing "If we run a query with a download format such as CSV we should be able to use cached results elsewhere"
    (let [query          (mt/mbql-query venues {:order-by [[:asc $id]], :limit 7})
          normal-results (qp/process-query query)]
      (is (= false
             (boolean (:cached normal-results)))
          "Query shouldn't be cached when running without mock cache in place")
      (with-mock-cache [save-chan]
        (let [query (assoc query :cache-ttl 100)]
          (with-open [os (java.io.ByteArrayOutputStream.)]
            (is (= false
                   (boolean (:cached (qp/process-query query (qp.streaming/streaming-context :csv os)))))
                "Query shouldn't be cached after first run with the mock cache in place")
            (mt/wait-for-result save-chan))
          (is (= (-> (assoc normal-results :cached true)
                     (dissoc :updated_at)
                     (m/dissoc-in [:data :results_metadata :checksum]))
                 (-> (qp/process-query query)
                     (dissoc :updated_at)
                     (m/dissoc-in [:data :results_metadata :checksum])))
              "Query should be cached and results should match those ran without cache"))))))

(deftest caching-big-resultsets
  (testing "Make sure we can save large result sets without tripping over internal async buffers"
    (is (= 10000 (count (transduce identity
                                   (#'cache/save-results-xform 0 {} (byte 0) conj)
                                   (repeat 10000 [1]))))))
  (testing "Make sure we don't block somewhere if we decide not to save results"
    (is (= 10000 (count (transduce identity
                                   (#'cache/save-results-xform (System/currentTimeMillis) {} (byte 0) conj)
                                   (repeat 10000 [1]))))))
  (testing "Make sure we properly handle situations where we abort serialization (e.g. due to result being too big)"
    (let [max-bytes (* (public-settings/query-caching-max-kb) 1024)]
      (is (= max-bytes (count (transduce identity
                                         (#'cache/save-results-xform 0 {} (byte 0) conj)
                                         (repeat max-bytes [1]))))))))
