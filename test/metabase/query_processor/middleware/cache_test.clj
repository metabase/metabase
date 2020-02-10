(ns metabase.query-processor.middleware.cache-test
  "Tests for the Query Processor cache."
  (:require [clojure.test :refer :all]
            [metabase.models.query-cache :refer [QueryCache]]
            [metabase.query-processor.middleware.cache :as cache]
            [metabase.test :as mt]
            [toucan.db :as db]))

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

(def ^:private ^:dynamic ^Integer *query-execution-delay-ms* 0)

(defn- run-query [& {:as query-kvs}]
  (cached?
   ;; TODO - needs to delay for `*query-execution-delay-ms*`
   (:metadata
    (mt/test-qp-middleware
     cache/maybe-return-cached-results
     (merge {:cache-ttl 60, :query :abc} query-kvs)
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
                 (Thread/sleep *query-execution-delay-ms*))}))))

(defn- clear-cache! [] (db/simple-delete! QueryCache))

(defmacro ^:private with-cache-cleared-before-each
  "Add a call to `(clear-cache!`) before every form in `body`."
  [& body]
  `(do ~@(interleave (repeat `(clear-cache!)) body)))

(deftest end-to-end-test
  (with-cache-cleared-before-each
    (testing "if there's nothing in the cache, cached results should *not* be returned"
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-min-ttl 0]
        (is (= :not-cached
               (run-query)))))

    (testing "if we run the query twice, the second run should return cached results"
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-min-ttl 0]
        (run-query)
        (is (= :cached
               (run-query)))))

    (testing "...but if the cache entry is past it's TTL, the cached results shouldn't be returned"
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-min-ttl 0]
        (run-query :cache-ttl 1)
        (Thread/sleep 2000)
        (is (= :not-cached
               (run-query :cache-ttl 1)))))

    (testing "if caching is disabled then cache shouldn't be used even if there's something valid in there"
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-min-ttl 0]
        (run-query)
        (mt/with-temporary-setting-values [enable-query-caching  false
                                           query-caching-min-ttl 0]
          (is (= :not-cached
                 (run-query))))))

    (testing "check that `query-caching-max-kb` is respected and queries aren't cached if they're past the threshold"
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-max-kb  0
                                         query-caching-min-ttl 0]
        (run-query)
        (is (= :not-cached
               (run-query)))))

    (testing (str "check that `query-caching-max-ttl` is respected. Whenever a new query is cached the cache should "
                  "evict any entries older that `query-caching-max-ttl`. Set max-ttl to one second, run query `:abc`, "
                  "then wait two seconds, and run `:def`. This should trigger the cache flush for entries past "
                  "`:max-ttl`; and the cached entry for `:abc` should be deleted. Running `:abc` a subsequent time "
                  "should not return cached results")
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-max-ttl 1
                                         query-caching-min-ttl 0]
        (run-query)
        (Thread/sleep 2000)
        (run-query, :query :def)
        (is (= :not-cached
               (run-query)))))

    (testing "check that *ignore-cached-results* is respected when returning results..."
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-min-ttl 0]
        (run-query)
        (binding [cache/*ignore-cached-results* true]
          (is (= :not-cached
                 (run-query))))))

    (testing "...but if it's set those results should still be cached for next time."
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-min-ttl 0]
        (binding [cache/*ignore-cached-results* true]
          (run-query))
        (is (= :cached
               (run-query)))))

    (testing "if the cache takes less than the min TTL to execute, it shouldn't be cached"
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-min-ttl 60]
        (run-query)
        (is (= :not-cached
               (run-query)))))

    (testing "...but if it takes *longer* than the min TTL, it should be cached"
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-min-ttl 1]
        (binding [*query-execution-delay-ms* 1200]
          (run-query)
          (is (= :cached
                 (run-query))))))))
