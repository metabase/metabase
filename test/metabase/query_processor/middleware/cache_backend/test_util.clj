(ns metabase.query-processor.middleware.cache-backend.test-util
  "Shared query-cache behavior tests for concrete cache backends."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.settings :as driver.settings]
   [metabase.query-processor.middleware.cache :as cache]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private ^:dynamic *query-token*
  nil)

(def ^:private ^:dynamic ^Long *query-execution-delay-ms*
  10)

(def ^:private ^:dynamic *query-caching-min-ttl*
  0)

(def ^:private ^:dynamic *rows*
  [[:toucan      71]
   [:bald-eagle  92]
   [:hummingbird 11]
   [:owl         10]
   [:chicken     69]
   [:robin       96]
   [:osprey      72]
   [:flamingo    70]])

(defn- ttl-strategy []
  {:type             :ttl
   :multiplier       60
   :avg-execution-ms 1000
   :min-duration-ms  *query-caching-min-ttl*})

(defn- stage
  [test-case]
  {:lib/type                :mbql.stage/mbql
   :source-table            2
   :cache-backend-test-token *query-token*
   :cache-backend-test-case  test-case})

(defn- test-query
  [test-case query-kvs]
  (merge {:cache-strategy (ttl-strategy)
          :lib/type       :mbql/query
          :database       1
          :stages         [(stage test-case)]}
         query-kvs))

(defn- run-query*
  [test-case & {:as query-kvs}]
  (let [qp       (cache/maybe-return-cached-results qp.pipeline/*run*)
        metadata {}
        rows     *rows*
        query    (test-query test-case query-kvs)]
    (binding [driver.settings/*query-timeout-ms* 2000
              qp.pipeline/*execute*             (fn [_driver _query respond]
                                                  (Thread/sleep *query-execution-delay-ms*)
                                                  (respond metadata rows))]
      (driver/with-driver :h2
        (-> (qp query qp.reducible/default-rff)
            (assoc :data {}))))))

(defn- run-query
  [test-case & args]
  (let [result (apply run-query* test-case args)]
    (is (= :completed
           (:status result)))
    (if (:cached (:cache/details result))
      :cached
      :not-cached)))

(defn- query-hash
  [test-case & {:as query-kvs}]
  (qp.util/query-hash (test-query test-case query-kvs)))

(defn assert-query-cache-behavior!
  "Run the same query-cache middleware behavior checks against `backend`."
  [backend]
  (let [token (str (random-uuid))]
    (binding [cache/*backend* backend
              *query-token*   token]
      (mt/with-temporary-setting-values [query-caching-max-ttl     60
                                         synchronous-batch-updates true]
        (testing "cache miss then cache hit"
          (is (= :not-cached
                 (run-query :hit)))
          (is (= :cached
                 (run-query :hit))))
        (testing "a query that returns no rows is cached"
          (binding [*rows* []]
            (is (= :not-cached
                   (run-query :empty-results)))
            (is (= :cached
                   (run-query :empty-results)))))
        (testing "expired results are recomputed"
          (let [strategy (assoc (ttl-strategy) :multiplier 0.1)]
            (is (= :not-cached
                   (run-query :expired :cache-strategy strategy)))
            (Thread/sleep 200)
            (is (= :not-cached
                   (run-query :expired :cache-strategy strategy)))))
        (testing "expired results are served stale while another process holds the refresh lease"
          (let [strategy   (assoc (ttl-strategy) :multiplier 0.1)
                query-hash (query-hash :stale :cache-strategy strategy)]
            (is (= :not-cached
                   (run-query :stale :cache-strategy strategy)))
            (Thread/sleep 200)
            (is (true?
                 (i/try-acquire-refresh-lease! backend query-hash 600000)))
            (is (= :cached
                   (run-query :stale :cache-strategy strategy)))))
        (testing "ignore-cached-results? skips reading a cached entry"
          (is (= :not-cached
                 (run-query :ignore-read :middleware {:ignore-cached-results? false})))
          (is (= :not-cached
                 (run-query :ignore-read :middleware {:ignore-cached-results? true}))))
        (testing "ignore-cached-results? still saves results for later"
          (is (= :not-cached
                 (run-query :ignore-save :middleware {:ignore-cached-results? true})))
          (is (= :cached
                 (run-query :ignore-save))))
        (testing "min TTL prevents fast queries from being cached"
          (binding [*query-caching-min-ttl* 1000]
            (is (= :not-cached
                   (run-query :min-ttl)))
            (is (= :not-cached
                   (run-query :min-ttl)))))
        (testing "queries longer than min TTL are cached"
          (binding [*query-caching-min-ttl* 0.1]
            (is (= :not-cached
                   (run-query :min-ttl-eligible)))
            (is (= :cached
                   (run-query :min-ttl-eligible)))))
        (testing "invalid cache entries are treated as misses"
          (let [query-hash (query-hash :invalid)]
            (is (= :not-cached
                   (run-query :invalid)))
            (is (true?
                 (i/cached-results backend query-hash
                                   (fn [is _updated-at] (some? is)))))
            (i/save-results! backend query-hash (byte-array [0 0 0]))
            (is (= :not-cached
                   (run-query :invalid)))))
        (testing "cache hit metadata is returned"
          (mt/with-clock #t "2020-02-19T02:31:07.798Z[UTC]"
            (is (= :not-cached
                   (run-query :metadata)))
            (let [result (run-query* :metadata)]
              (is (=? {:data          {}
                       :cache/details {:cached     true
                                       :updated_at some?
                                       :cache-hash some?}
                       :row_count     8
                       :status        :completed}
                      result))
              (is (bytes? (get-in result [:cache/details :hash]))))))
        (testing "manual purge of old entries makes the next run miss"
          (is (= :not-cached
                 (run-query :purge)))
          (Thread/sleep 50)
          (i/purge-old-entries! backend 0)
          (is (= :not-cached
                 (run-query :purge))))))))
