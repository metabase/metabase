(ns ^:mb/driver-tests metabase.query-processor.middleware.cache-test
  "Tests for the Query Processor cache."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.core.async :as a]
   [clojure.data.csv :as csv]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.cache.core]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.queries.models.query :as query]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.cache :as cache]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.query-processor.middleware.cache.impl :as impl]
   [metabase.query-processor.middleware.process-userland-query :as process-userland-query]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.util :as qp.util]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.initialize :as initialize]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [pretty.core :as pretty]
   [toucan2.core :as t2])
  (:import
   (java.time ZonedDateTime)))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :once (fn [thunk]
                      (initialize/initialize-if-needed! :db)
                      (metabase.cache.core/enable-query-caching! true)
                      (thunk)))

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
      (cached-results [this query-hash strategy respond]
        (assert (= :ttl (:type strategy)))
        (assert (contains? strategy :avg-execution-ms))
        (let [hex-hash   (codecs/bytes->hex query-hash)
              max-age-ms (* (:multiplier strategy)
                            (:avg-execution-ms strategy))]
          (log/tracef "Fetch results for %s store: %s" hex-hash (pretty/pretty this))
          (if-let [^bytes results (when-let [{:keys [created results]} (some (fn [[hash entry]]
                                                                               (when (= hash hex-hash)
                                                                                 entry))
                                                                             @store)]
                                    (when (t/after? created (t/minus (t/instant) (t/millis max-age-ms)))
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

(defn do-with-mock-cache! [f]
  (mt/with-open-channels [save-chan  (a/chan 10)
                          purge-chan (a/chan 10)]
    (mt/with-temporary-setting-values [query-caching-max-ttl 60]
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

(defmacro with-mock-cache! [[& bindings] & body]
  `(do-with-mock-cache! (fn [{:keys [~@bindings]}] ~@body)))

(def ^:private ^:dynamic ^Long *query-execution-delay-ms* 10)

(def ^:private ^:dynamic *query-caching-min-ttl*
  "Set this to zero to prevent flakes - we don't want a query to slip under the wire here."
  0)

(defn ^:private ttl-strategy []
  {:type             :ttl
   :multiplier       60
   :avg-execution-ms 1000
   :min-duration-ms  *query-caching-min-ttl*})

(defn- test-query [query-kvs]
  (merge {:cache-strategy (ttl-strategy), :lib/type :mbql/query, :stages [{:abc :def}]} query-kvs))

(defn- run-query* [& {:as query-kvs}]
  ;; clear out stale values in save/purge channels
  (while (a/poll! *save-chan*))
  (while (a/poll! *purge-chan*))
  (let [qp       (cache/maybe-return-cached-results qp.pipeline/*run*)
        metadata {}
        rows     [[:toucan      71]
                  [:bald-eagle  92]
                  [:hummingbird 11]
                  [:owl         10]
                  [:chicken     69]
                  [:robin       96]
                  [:osprey      72]
                  [:flamingo    70]]
        query    (test-query query-kvs)]
    (binding [driver.settings/*query-timeout-ms* 2000
              qp.pipeline/*execute*             (fn [_driver _query respond]
                                                  (Thread/sleep *query-execution-delay-ms*)
                                                  (respond metadata rows))]
      (driver/with-driver :h2
        (-> (qp query qp.reducible/default-rff)
            (assoc :data {}))))))

(defn- run-query [& args]
  (let [result (apply run-query* args)]
    (is (partial= {:status :completed}
                  result))
    (if (:cached (:cache/details result))
      :cached
      :not-cached)))

(defn- cacheable? [& {:as query-kvs}]
  (boolean (#'cache/is-cacheable? (merge {:cache-strategy (ttl-strategy), :query :abc} query-kvs))))

(deftest is-cacheable-test
  (testing "something is-cacheable? if it includes `:cache-strategy` and it is not `:nocache`"
    (with-mock-cache! []
      (doseq [[cache-strategy expected] {(ttl-strategy)   true
                                         {:type :nocache} false
                                         nil              false}]
        (testing (format "cache strategy = %s" (pr-str cache-strategy))
          (is (= expected
                 (boolean (#'cache/is-cacheable? {:cache-strategy cache-strategy}))))))
      (testing "but enable-query-caching setting is still respected"
        (mt/with-temporary-setting-values [enable-query-caching false]
          (is (= false
                 (boolean (#'cache/is-cacheable? {:cache-strategy (ttl-strategy)})))))))))

(deftest empty-cache-test
  (testing "if there's nothing in the cache, cached results should *not* be returned"
    (with-mock-cache! []
      (is (= :not-cached
             (run-query))))))

(deftest return-cached-results-test
  (testing "if we run the query twice, the second run should return cached results"
    (with-mock-cache! [save-chan]
      (is (true?
           (cacheable?)))
      (run-query)
      (mt/wait-for-result save-chan)
      (is (= :cached
             (run-query))))))

(deftest expired-results-test
  (testing "If cached resutls are past their TTL, the cached results shouldn't be returned"
    (with-mock-cache! [save-chan]
      (run-query :cache-strategy (assoc (ttl-strategy) :multiplier 0.1))
      (mt/wait-for-result save-chan)
      (Thread/sleep 200)
      (is (= :not-cached
             (run-query :cache-strategy (assoc (ttl-strategy) :multiplier 0.1)))))))

(deftest ignore-valid-results-when-caching-is-disabled-test
  (testing "if caching is disabled then cache shouldn't be used even if there's something valid in there"
    (with-mock-cache! [save-chan]
      (run-query)
      (mt/wait-for-result save-chan)
      (is (= false
             (cacheable? {:cache-strategy nil})))
      (is (= :not-cached
             (run-query {:cache-strategy nil}))))))

(deftest max-kb-test
  (testing "check that `query-caching-max-kb` is respected and queries aren't cached if they're past the threshold"
    (with-mock-cache! [save-chan]
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
    (with-mock-cache! [purge-chan]
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
    (with-mock-cache! [save-chan]
      (run-query :middleware {:ignore-cached-results? false})
      (mt/wait-for-result save-chan)
      (is (= :not-cached
             (run-query :middleware {:ignore-cached-results? true}))))))

(deftest ignore-cached-results-should-still-save-test
  (testing "...but if it's set those results should still be cached for next time."
    (with-mock-cache! [save-chan]
      (is (true? (cacheable?)))
      (run-query :middleware {:ignore-cached-results? true})
      (mt/wait-for-result save-chan)
      (is (= :cached (run-query))))))

(deftest min-ttl-test
  (testing "if the cache takes less than the min TTL to execute, it shouldn't be cached"
    (with-mock-cache! [save-chan]
      (binding [*query-caching-min-ttl* 1000]
        (run-query)
        (is (= :metabase.test.util.async/timed-out
               (mt/wait-for-result save-chan)))
        (is (= :not-cached
               (run-query))))))

  (testing "...but if it takes *longer* than the min TTL, it should be cached"
    (with-mock-cache! [save-chan]
      (binding [*query-caching-min-ttl* 0.1]
        (run-query)
        (mt/wait-for-result save-chan)
        (is (= :cached
               (run-query)))))))

(deftest invalid-cache-entry-test
  (testing "We should handle invalid cache entries gracefully"
    (with-mock-cache! [save-chan]
      (run-query)
      (mt/wait-for-result save-chan)
      (let [query-hash (qp.util/query-hash (test-query nil))]
        (testing "Cached results should exist"
          (is (true?
               (i/cached-results cache/*backend* query-hash (ttl-strategy)
                                 some?))))
        (i/save-results! cache/*backend* query-hash (byte-array [0 0 0]))
        (testing "Invalid cache entry should be handled gracefully"
          (is (= :not-cached
                 (run-query))))))))

(deftest metadata-test
  (testing "Verify that correct metadata about caching such as `:updated_at` and `:cached` come back with cached results"
    (with-mock-cache! [save-chan]
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

(deftest array-query-can-be-cached-test
  #_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :test/arrays)
                         :sqlite) ;; Disabling until issue #57301 is resolved
    (with-mock-cache! [save-chan]
      (mt/with-temporary-setting-values [enable-query-caching true]
        (mt/with-clock #t "2025-02-06T00:00:00.000Z[UTC]"
          (let [query           (mt/native-query {:query (tx/native-array-query driver/*driver*)})
                query           (assoc query :cache-strategy (ttl-strategy))
                original-result (qp/process-query query)
                              ;; clear any existing values in the `save-chan`
                _               (while (a/poll! save-chan))
                _               (mt/wait-for-result save-chan)
                cached-result   (qp/process-query query)]
            (is (=? {:cache/details {:stored true
                                     :hash   some?}
                     :row_count     1
                     :status        :completed}
                    (dissoc original-result :data)))
            (is (=? {:cache/details {:cached     true
                                     :updated_at #t "2025-02-06T00:00:00.000Z[UTC]"
                                     :hash       some?}
                     :row_count     1
                     :status        :completed}
                    (dissoc cached-result :data)))
            (is (= (seq (-> original-result :cache/details :hash))
                   (seq (-> cached-result :cache/details :hash))))
            (is (= (dissoc original-result :cache/details)
                   (dissoc cached-result :cache/details)))))))))

(deftest e2e-test
  (testing "Test that the caching middleware actually working in the context of the entire QP"
    (doseq [query [(mt/mbql-query venues {:order-by [[:asc $id]], :limit 5})
                   (mt/native-query {:query "SELECT * FROM VENUES ORDER BY ID ASC LIMIT 5;"})]]
      (with-mock-cache! [save-chan]
        (let [query (assoc query :cache-strategy (ttl-strategy))]
          (testing (format "query = %s" (pr-str query))
            (is (true?
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
                                          :hash       some?
                                          ;; TODO: this check is not working if the key is not present in the data
                                          :cache-hash some?}
                         :row_count 5
                         :status    :completed}
                        (dissoc cached-result :data))
                    "Results should be cached")
                (is (= (seq (-> original-result :cache/details :hash))
                       (seq (-> cached-result :cache/details :hash))))
                (is (= (dissoc original-result :cache/details)
                       (dissoc cached-result :cache/details))
                    "Cached result should be in the same format as the uncached result, except for added keys")))))))))

(deftest e2e-test-2
  (testing "Cached results don't impact average execution time"
    (let [save-execution-metadata-count       (atom 0)
          update-avg-execution-count          (atom 0)
          called-promise                      (promise)
          save-execution-metadata-original    (var-get #'process-userland-query/save-execution-metadata!*)
          save-query-update-avg-time-original query/save-query-and-update-average-execution-time!]
      (with-redefs [process-userland-query/save-execution-metadata!*     (fn [& args]
                                                                           (swap! save-execution-metadata-count inc)
                                                                           (apply save-execution-metadata-original args)
                                                                           (deliver called-promise true))
                    query/save-query-and-update-average-execution-time! (fn [& args]
                                                                          (swap! update-avg-execution-count inc)
                                                                          (apply save-query-update-avg-time-original args))]
        (let [query  (assoc (mt/mbql-query venues {:order-by [[:asc $id]] :limit 42})
                            :cache-strategy (assoc (ttl-strategy) :multiplier 5000))
              q-hash (qp.util/query-hash query)]
          (with-mock-cache! [save-chan]
            (t2/delete! :model/Query :query_hash q-hash)
            (is (not (:cached (qp/process-query (qp/userland-query query)))))
            (a/alts!! [save-chan (a/timeout 200)]) ;; wait-for-result closes the channel
            (u/deref-with-timeout called-promise 500)
            (is (= 1 @save-execution-metadata-count))
            (is (= 1 @update-avg-execution-count))
            (let [avg-execution-time (query/average-execution-time-ms q-hash)]
              (is (pos? avg-execution-time))
              ;; rerun query getting cached results
              (is (instance? ZonedDateTime
                             (:cached (qp/process-query (qp/userland-query query)))))
              (mt/wait-for-result save-chan)
              (is (= 2 @save-execution-metadata-count)
                  "Saving execution times of a cache lookup")
              (is (= 1 @update-avg-execution-count)
                  "Cached query execution should not update average query duration")
              (is (= avg-execution-time (query/average-execution-time-ms q-hash))))))))))

(def ^:private expected-inner-metadata
  (for [name ["ID"
              "NAME"
              "CATEGORY_ID"
              "LATITUDE"
              "LONGITUDE"
              "PRICE"]]
    {:name name}))

(deftest multiple-models-e2e-test
  (testing "caching works across the whole QP where two models have the same inner query"
    (let [inner-query (mt/mbql-query venues {:order-by [[:asc $id]], :limit 5})]
      (mt/with-temp [:model/Card model1 (mt/card-with-metadata {:dataset_query inner-query
                                                                :name          "Model 1"
                                                                :type          :model})
                     :model/Card model2 (mt/card-with-metadata {:dataset_query inner-query
                                                                :name          "Model 2"
                                                                :type          :model})]
        (testing "both models get :result_metadata containing model :idents"
          (doseq [the-model [model1 model2]]
            (is (=? expected-inner-metadata
                    (:result_metadata the-model)))))
        (with-mock-cache! [save-chan]
          (let [inner1 (-> (:dataset_query model1)
                           (assoc :cache-strategy (ttl-strategy)))
                inner2 (-> (:dataset_query model2)
                           (assoc :cache-strategy (ttl-strategy)))]
            (testing (format "\ninner1 = %s\ninner2 = %s" (pr-str inner1) (pr-str inner2))
              (is (true?
                   (boolean (#'cache/is-cacheable? inner1)))
                  "Query should be cacheable")
              (is (true?
                   (boolean (#'cache/is-cacheable? inner2)))
                  "Query should be cacheable")

              (mt/with-clock #t "2020-02-19T04:44:26.056Z[UTC]"
                (let [_                (qp/process-query inner1)
                      ;; clear any existing values in the `save-chan`
                      _                (while (a/poll! save-chan))
                      _                (mt/wait-for-result save-chan)
                      rerun-inner1     (qp/process-query inner1)
                      rerun-inner2     (qp/process-query inner2)]
                  (testing "\n\nInner queries are cached and have generic metadata"
                    (doseq [[the-model cached-results] [[model1 rerun-inner1]
                                                        [model2 rerun-inner2]]]
                      (testing (:name the-model)
                        (testing "results should be cached"
                          (is (=? {:cache/details  {:cached     true
                                                    :updated_at #t "2020-02-19T04:44:26.056Z[UTC]"
                                                    :hash       some?
                                                    ;; TODO: this check is not working if the key is not present in the data
                                                    :cache-hash some?}
                                   :row_count 5
                                   :status    :completed}
                                  (dissoc cached-results :data))))
                        (testing "should have correct **generic** metadata"
                          (is (=? expected-inner-metadata
                                  (-> cached-results :data :results_metadata :columns))))))))

                (let [outer1           (-> (mt/mbql-query nil {:source-table (str "card__" (:id model1))})
                                           (assoc :cache-strategy (ttl-strategy)))
                      outer2           (-> (mt/mbql-query nil {:source-table (str "card__" (:id model2))})
                                           (assoc :cache-strategy (ttl-strategy)))
                      original-result1 (qp/process-query outer1)
                      _                (while (a/poll! save-chan))
                      _                (mt/wait-for-result save-chan)
                      rerun-outer1     (qp/process-query outer1)
                      one-run-outer2   (qp/process-query outer2)]
                  (testing "Original results have correct model metadata"
                    (is (=? expected-inner-metadata
                            (-> original-result1 :data :results_metadata :columns))))

                  (testing "\n\nOuter queries are cached *separately*"
                    (is (=? {:cache/details  {:cached     true
                                              :updated_at #t "2020-02-19T04:44:26.056Z[UTC]"
                                              :hash       some?
                                              ;; TODO: this check is not working if the key is not present in the data
                                              :cache-hash some?}
                             :row_count 5
                             :status    :completed}
                            (dissoc rerun-outer1 :data))
                        "second run of model1 is cached")

                    (is (=? {:cache/details {:stored true
                                             :cached (symbol "nil #_\"key is not present.\"")
                                             :hash   some?}}
                            one-run-outer2)
                        "first run of model2 is stored, but not served from cache"))

                  (testing "\n\nOuter queries have model-specific metadata"
                    (doseq [[the-model cached-results] [[model1 rerun-outer1]
                                                        [model2 one-run-outer2]]]
                      (testing (:name the-model)
                        (is (=? expected-inner-metadata
                                (-> cached-results :data :results_metadata :columns)))))))))))))))

(deftest duplicate-native-queries-e2e-test
  (testing "caching works across the whole QP when two native cards have the same inner query"
    (let [inner-query (mt/native-query {:query "SELECT ID, NAME FROM venues ORDER BY ID LIMIT 5;"})]
      (mt/with-temp [:model/Card card1 (mt/card-with-metadata {:dataset_query inner-query
                                                               :name          "Native card 1"})
                     :model/Card card2 (mt/card-with-metadata {:dataset_query inner-query
                                                               :name          "Native card 2"})]
        (testing "both cards get :result_metadata containing the card's :entity_id"
          (is (=? [{:name "ID"}
                   {:name "NAME"}]
                  (:result_metadata card1)))
          (is (=? [{:name "ID"}
                   {:name "NAME"}]
                  (:result_metadata card2))))

        (with-mock-cache! [save-chan]
          (let [query1 (-> (:dataset_query card1)
                           (assoc :cache-strategy (ttl-strategy)))
                query2 (-> (:dataset_query card2)
                           (assoc :cache-strategy (ttl-strategy)))]
            (testing (format "\nquery1 = %s\nquery2 = %s" (pr-str query1) (pr-str query2))
              (is (true?
                   (boolean (#'cache/is-cacheable? query1)))
                  "Query should be cacheable")
              (is (true?
                   (boolean (#'cache/is-cacheable? query2)))
                  "Query should be cacheable")

              (mt/with-clock #t "2020-02-19T04:44:26.056Z[UTC]"
                (let [_                (qp/process-query query1)
                      ;; clear any existing values in the `save-chan`
                      _                (while (a/poll! save-chan))
                      _                (mt/wait-for-result save-chan)
                      rerun-query1     (qp/process-query query1)
                      rerun-query2     (qp/process-query query2)]
                  (testing "\n\nNative queries are cached and return card-specific metadata"
                    (is (= (-> rerun-query1 :cache/details :hash codecs/bytes->hex)
                           (-> rerun-query2 :cache/details :hash codecs/bytes->hex))
                        "these two queries must have the same hash, or this whole test is not testing anything")

                    (doseq [[the-card cached-results] [[card1 rerun-query1]
                                                       [card2 rerun-query2]]]
                      (testing (:name the-card)
                        (testing "results should be cached"
                          (is (=? {:cache/details  {:cached     true
                                                    :updated_at #t "2020-02-19T04:44:26.056Z[UTC]"
                                                    :hash       some?
                                                    ;; TODO: this check is not working if the key is not present in the
                                                    ;; data
                                                    :cache-hash some?}
                                   :row_count 5
                                   :status    :completed}
                                  (dissoc cached-results :data))))
                        (testing "should have correct **card-specific** metadata"
                          (is (=? [{:name "ID"}
                                   {:name "NAME"}]
                                  (-> cached-results :data :results_metadata :columns))))))))))))))))

(deftest insights-from-cache-test
  (testing "Insights should work on cached results (#12556)"
    (with-mock-cache! [save-chan]
      (let [query (-> checkins
                      (mt/mbql-query {:breakout    [!month.date]
                                      :aggregation [[:count]]})
                      (assoc :cache-strategy (ttl-strategy)))]
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
    (with-mock-cache! [save-chan]
      (let [query (assoc (mt/mbql-query venues {:order-by [[:asc $id]], :limit 6})
                         :cache-strategy (ttl-strategy))]
        (with-open [os (java.io.ByteArrayOutputStream.)]
          (qp.streaming/do-with-streaming-rff
           :csv os
           (fn [rff]
             (qp/process-query query rff)))
          (mt/wait-for-result save-chan))
        (is (true?
             (:cached (:cache/details (qp/process-query query))))
            "Results should be cached")
        (let [uncached-results (with-open [ostream (java.io.PipedOutputStream.)
                                           istream (java.io.PipedInputStream. ostream)
                                           reader  (java.io.InputStreamReader. istream)]
                                 (qp.streaming/do-with-streaming-rff
                                  :csv ostream
                                  (fn [rff]
                                    (qp/process-query (dissoc query :cache-strategy) rff)))
                                 (vec (csv/read-csv reader)))]
          (with-redefs [sql-jdbc.execute/execute-reducible-query (fn [& _]
                                                                   (throw (Exception. "Should be cached!")))]
            (with-open [ostream (java.io.PipedOutputStream.)
                        istream (java.io.PipedInputStream. ostream)
                        reader  (java.io.InputStreamReader. istream)]
              (qp.streaming/do-with-streaming-rff
               :csv ostream
               (fn [rff]
                 (qp/process-query query rff)))
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
      (with-mock-cache! [save-chan]
        (let [query (assoc query :cache-strategy (ttl-strategy))]
          (with-open [os (java.io.ByteArrayOutputStream.)]
            (qp.streaming/do-with-streaming-rff
             :csv os
             (fn [rff]
               (is (= false
                      (boolean (:cached (qp/process-query query rff))))
                   "Query shouldn't be cached after first run with the mock cache in place")))
            (mt/wait-for-result save-chan))
          (is (= (-> (assoc normal-results :cache/details {:cached true})
                     (m/dissoc-in [:data :results_metadata :checksum]))
                 (-> (qp/process-query query)
                     (update :cache/details select-keys [:cached])
                     (m/dissoc-in [:data :results_metadata :checksum])))
              "Query should be cached and results should match those ran without cache"))))))

(deftest ^:parallel caching-big-resultsets
  (testing "Make sure we can save large result sets without tripping over internal async buffers"
    (is (= 10000 (count (transduce identity
                                   (#'cache/save-results-xform 0 {} (byte 0) (ttl-strategy) conj)
                                   (repeat 10000 [1]))))))
  (testing "Make sure we don't block somewhere if we decide not to save results"
    (is (= 10000 (count (transduce identity
                                   (#'cache/save-results-xform (System/currentTimeMillis) {} (byte 0) (ttl-strategy) conj)
                                   (repeat 10000 [1]))))))
  (testing "Make sure we properly handle situations where we abort serialization (e.g. due to result being too big)"
    (let [max-bytes (* (metabase.cache.core/query-caching-max-kb) 1024)]
      (is (= max-bytes (count (transduce identity
                                         (#'cache/save-results-xform 0 {} (byte 0) (ttl-strategy) conj)
                                         (repeat max-bytes [1]))))))))

(deftest perms-checks-should-still-apply-test
  (testing "Double-check that perms checks still happen even for cached results"
    (mt/with-temp-copy-of-db
      (mt/with-no-data-perms-for-all-users!
        (mt/with-test-user :rasta
          (with-mock-cache! [save-chan]
            (letfn [(run-forbidden-query []
                      (qp/process-query (assoc (mt/mbql-query checkins {:aggregation [[:count]]})
                                               :cache-strategy (ttl-strategy))))]
              (testing "Shouldn't be allowed to run a query if we don't have perms for it"
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"You do not have permissions to run this query"
                     (run-forbidden-query))))
              (testing "Run forbidden query as superuser to populate the cache"
                (request/with-current-user (mt/user->id :crowberto)
                  (is (= [[1000]]
                         (mt/rows (run-forbidden-query))))))
              (testing "Cache entry should be saved within 5 seconds"
                (let [[_ chan] (a/alts!! [save-chan (a/timeout 5000)])]
                  (is (= save-chan
                         chan))))
              (testing "Run forbidden query again as superuser again, should be cached"
                (request/with-current-user (mt/user->id :crowberto)
                  (is (=? {:cache/details {:cached     true
                                           :updated_at some?
                                           :cache-hash some?}}
                          (run-forbidden-query)))))
              (testing "Run query as regular user, should get perms Exception even though result is cached"
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"You do not have permissions to run this query"
                     (run-forbidden-query)))))))))))
