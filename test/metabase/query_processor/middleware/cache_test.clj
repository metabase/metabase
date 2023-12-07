(ns metabase.query-processor.middleware.cache-test
  "Tests for the Query Processor cache."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.core.async :as a]
   [clojure.data.csv :as csv]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.query :as query :refer [Query]]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor :as qp]
   [metabase.query-processor.context.default :as context.default]
   [metabase.query-processor.middleware.cache :as cache]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.query-processor.middleware.cache.impl :as impl]
   [metabase.query-processor.middleware.process-userland-query
    :as process-userland-query]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.util :as qp.util]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [pretty.core :as pretty]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
             (u/pprint-to-str 'blue
               (for [[hash {:keys [created]}] @store]
                 [hash (u/format-nanoseconds (.getNano (t/duration created (t/instant))))]))))

      i/CacheBackend
      (cached-results [this query-hash max-age-seconds respond]
        (let [hex-hash (codecs/bytes->hex query-hash)]
          (log/tracef "Fetch results for %s store: %s" hex-hash (pretty/pretty this))
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
        (let [hex-hash (codecs/bytes->hex query-hash)]
          (swap! store assoc hex-hash {:results results
                                       :created (t/instant)})
          (log/tracef "Save results for %s --> store: %s" hex-hash (pretty/pretty this)))
        (a/>!! save-chan results))

      (purge-old-entries! [this max-age-seconds]
        (swap! store (fn [store]
                       (into {} (filter (fn [[_ {:keys [created]}]]
                                          (t/after? created (t/minus (t/instant) (t/seconds max-age-seconds))))
                                        store))))
        (log/tracef "Purge old entries --> store: %s" (pretty/pretty this))
        (a/>!! purge-chan ::purge)))))

(defn do-with-mock-cache [f]
  (mt/with-open-channels [save-chan  (a/chan 10)
                          purge-chan (a/chan 10)]
    (mt/with-temporary-setting-values [enable-query-caching  true
                                       query-caching-max-ttl 60
                                       query-caching-min-ttl 0]
      (binding [cache/*backend* (test-backend save-chan purge-chan)
                *save-chan*     save-chan
                *purge-chan*    purge-chan]
        (let [orig @#'cache/serialized-bytes]
          (with-redefs [cache/serialized-bytes (fn []
                                                 ;; if `save-results!` isn't going to get called because `*result-fn*`
                                                 ;; throws an Exception, catch it and send it to `save-chan` so it still
                                                 ;; gets a result and tests can finish
                                                 (try
                                                   (orig)
                                                   (catch Throwable e
                                                     (a/>!! save-chan e)
                                                     (throw e))))]
            (f {:save-chan save-chan, :purge-chan purge-chan})))))))

(defmacro with-mock-cache [[& bindings] & body]
  `(do-with-mock-cache (fn [{:keys [~@bindings]}] ~@body)))

(def ^:private ^:dynamic ^Long *query-execution-delay-ms* 10)

(defn- test-query [query-kvs]
  (merge {:cache-ttl 60, :query :abc} query-kvs))

(defn- run-query* [& {:as query-kvs}]
  ;; clear out stale values in save/purge channels
  (while (a/poll! *save-chan*))
  (while (a/poll! *purge-chan*))
  (let [qp       (qp.reducible/sync-qp
                  (qp.reducible/async-qp
                   (cache/maybe-return-cached-results qp.reducible/identity-qp)))
        metadata {}
        rows     [[:toucan      71]
                  [:bald-eagle  92]
                  [:hummingbird 11]
                  [:owl         10]
                  [:chicken     69]
                  [:robin       96]
                  [:osprey      72]
                  [:flamingo    70]]
        query    (test-query query-kvs)
        context  {:timeout  2000
                  :executef (fn [_driver _query _context respond]
                              (Thread/sleep *query-execution-delay-ms*)
                              (respond metadata rows))}]
    (-> (qp query context)
        (assoc :data {}))))

(defn- run-query [& args]
  (let [result (apply run-query* args)]
    (is (partial= {:status :completed}
                  result))
    (if (:cached (:cache/details result))
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
  (testing "check that :ignore-cached-results? in middleware is respected when returning results..."
    (with-mock-cache [save-chan]
      (run-query :middleware {:ignore-cached-results? false})
      (mt/wait-for-result save-chan)
      (is (= :not-cached
             (run-query :middleware {:ignore-cached-results? true}))))))

(deftest ignore-cached-results-should-still-save-test
  (testing "...but if it's set those results should still be cached for next time."
    (with-mock-cache [save-chan]
      (is (= true (cacheable?)))
      (run-query :middleware {:ignore-cached-results? true})
      (mt/wait-for-result save-chan)
      (is (= :cached (run-query))))))

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
      (let [query-hash (qp.util/query-hash (test-query nil))]
        (testing "Cached results should exist"
          (is (= true
                 (i/cached-results cache/*backend* query-hash 100
                   some?))))
        (i/save-results! cache/*backend* query-hash (byte-array [0 0 0]))
        (testing "Invalid cache entry should be handled gracefully"
          (is (= :not-cached
                 (run-query))))))))

(deftest metadata-test
  (testing "Verify that correct metadata about caching such as `:updated_at` and `:cached` come back with cached results."
    (with-mock-cache [save-chan]
      (mt/with-clock #t "2020-02-19T02:31:07.798Z[UTC]"
        (run-query)
        (mt/wait-for-result save-chan)
        (let [result (run-query*)]
          (is (=? {:data          {}
                   :cache/details {:cached     true
                                   :updated_at #t "2020-02-19T02:31:07.798Z[UTC]"
                                   :cache-hash some?}
                   :row_count     8
                   :status        :completed}
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
                (is (=? {:cache/details  {:cached     true
                                          :updated_at #t "2020-02-19T04:44:26.056Z[UTC]"
                                          :cache-hash some?}
                         :row_count 5
                         :status    :completed}
                       (dissoc cached-result :data))
                    "Results should be cached")
                (is (= (seq (-> original-result :cache/details :cache-hash))
                       (seq (-> cached-result :cache/details :cache-hash))))
                (is (= (dissoc original-result :cache/details) (dissoc cached-result :cache/details))
                    "Cached result should be in the same format as the uncached result, except for added keys"))))))))
  (testing "Cached results don't impact average execution time"
    (let [query                               (assoc (mt/mbql-query venues {:order-by [[:asc $id]] :limit 42})
                                                     :cache-ttl 5000)
          q-hash                              (qp.util/query-hash query)
          save-query-execution-count          (atom 0)
          update-avg-execution-count          (atom 0)
          called-promise                      (promise)
          save-query-execution-original       (var-get #'process-userland-query/save-query-execution!*)
          save-query-update-avg-time-original query/save-query-and-update-average-execution-time!]
      (with-redefs [process-userland-query/save-query-execution!*       (fn [& args]
                                                                          (swap! save-query-execution-count inc)
                                                                          (apply save-query-execution-original args)
                                                                          (deliver called-promise true))
                    query/save-query-and-update-average-execution-time! (fn [& args]
                                                                          (swap! update-avg-execution-count inc)
                                                                          (apply save-query-update-avg-time-original args))
                    cache/min-duration-ms                               (constantly 0)]
        (with-mock-cache [save-chan]
          (t2/delete! Query :query_hash q-hash)
          (is (not (:cached (qp/process-userland-query query (context.default/default-context)))))
          (a/alts!! [save-chan (a/timeout 200)]) ;; wait-for-result closes the channel
          (u/deref-with-timeout called-promise 500)
          (is (= 1 @save-query-execution-count))
          (is (= 1 @update-avg-execution-count))
          (let [avg-execution-time (query/average-execution-time-ms q-hash)]
            (is (number? avg-execution-time))
            ;; rerun query getting cached results
            (is (:cached (qp/process-userland-query query (context.default/default-context))))
            (mt/wait-for-result save-chan)
            (is (= 2 @save-query-execution-count)
                "Saving execution times of a cache lookup")
            (is (= 1 @update-avg-execution-count)
                "Cached query execution should not update average query duration")
            (is (= avg-execution-time (query/average-execution-time-ms q-hash)))))))))

(deftest insights-from-cache-test
  (testing "Insights should work on cahced results (#12556)"
    (with-mock-cache [save-chan]
      (let [query (-> checkins
                      (mt/mbql-query {:breakout    [!month.date]
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
          (let [{:keys [context rff]} (qp.streaming/streaming-context-and-rff :csv os)]
            (qp/process-query query rff context))
          (mt/wait-for-result save-chan))
        (is (= true
               (:cached (:cache/details (qp/process-query query))))
            "Results should be cached")
        (let [uncached-results (with-open [ostream (java.io.PipedOutputStream.)
                                           istream (java.io.PipedInputStream. ostream)
                                           reader  (java.io.InputStreamReader. istream)]
                                 (let [{:keys [context rff]} (qp.streaming/streaming-context-and-rff :csv ostream)]
                                   (qp/process-query (dissoc query :cache-ttl) rff context))
                                 (vec (csv/read-csv reader)))]
          (with-redefs [sql-jdbc.execute/execute-reducible-query (fn [& _]
                                                                   (throw (Exception. "Should be cached!")))]
            (with-open [ostream (java.io.PipedOutputStream.)
                        istream (java.io.PipedInputStream. ostream)
                        reader  (java.io.InputStreamReader. istream)]
              (let [{:keys [context rff]} (qp.streaming/streaming-context-and-rff :csv ostream)]
                (qp/process-query query rff context))
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
            (let [{:keys [rff context]} (qp.streaming/streaming-context-and-rff :csv os)]
              (is (= false
                     (boolean (:cached (qp/process-query query rff context))))
                  "Query shouldn't be cached after first run with the mock cache in place"))
            (mt/wait-for-result save-chan))
          (is (= (-> (assoc normal-results :cache/details {:cached true})
                     (m/dissoc-in [:data :results_metadata :checksum]))
                 (-> (qp/process-query query)
                     (update :cache/details select-keys [:cached])
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

(deftest perms-checks-should-still-apply-test
  (testing "Double-check that perms checks still happen even for cached results"
    (mt/with-temp-copy-of-db
      (perms/revoke-data-perms! (perms-group/all-users) (mt/db))
      (mt/with-test-user :rasta
        (with-mock-cache [save-chan]
          (letfn [(run-forbidden-query []
                    (qp/process-query (assoc (mt/mbql-query checkins {:aggregation [[:count]]})
                                             :cache-ttl 100)))]
            (testing "Shouldn't be allowed to run a query if we don't have perms for it"
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"You do not have permissions to run this query"
                   (run-forbidden-query))))
            (testing "Run forbidden query as superuser to populate the cache"
              (mw.session/with-current-user (mt/user->id :crowberto)
                (is (= [[1000]]
                       (mt/rows (run-forbidden-query))))))
            (testing "Cache entry should be saved within 5 seconds"
              (let [[_ chan] (a/alts!! [save-chan (a/timeout 5000)])]
                (is (= save-chan
                       chan))))
            (testing "Run forbidden query again as superuser again, should be cached"
              (mw.session/with-current-user (mt/user->id :crowberto)
                (is (=? {:cache/details {:cached     true
                                         :updated_at some?
                                         :cache-hash some?}}
                        (run-forbidden-query)))))
            (testing "Run query as regular user, should get perms Exception even though result is cached"
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"You do not have permissions to run this query"
                   (run-forbidden-query))))))))))
