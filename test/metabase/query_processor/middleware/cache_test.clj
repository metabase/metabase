(ns metabase.query-processor.middleware.cache-test
  "Tests for the Query Processor cache."
  (:require [expectations :refer :all]
            [metabase.models.query-cache :refer [QueryCache]]
            [metabase.query-processor.middleware.cache :as cache]
            [metabase.test.util :as tu]
            [toucan.db :as db]))

(def ^:private mock-results
  {:row_count 8
   :status    :completed
   :data      {:rows [[:toucan      71]
                      [:bald-eagle  92]
                      [:hummingbird 11]
                      [:owl         10]
                      [:chicken     69]
                      [:robin       96]
                      [:osprey      72]
                      [:flamingo    70]]}})

(def ^:private ^:dynamic ^Integer *query-execution-delay-ms* 0)

(defn- mock-qp [& _]
  (Thread/sleep *query-execution-delay-ms*)
  mock-results)

(def ^:private maybe-return-cached-results (cache/maybe-return-cached-results mock-qp))

(defn- clear-cache! [] (db/simple-delete! QueryCache))

(defn- cached? [results]
  (if (:cached results)
    :cached
    :not-cached))

(defn- run-query [& {:as query-kvs}]
  (cached? (maybe-return-cached-results (merge {:cache-ttl 60, :query :abc} query-kvs))))


;;; -------------------------------------------- tests for is-cacheable? ---------------------------------------------

;; something is-cacheable? if it includes a cach_ttl and the caching setting is enabled
(expect
  (tu/with-temporary-setting-values [enable-query-caching true]
    (#'cache/is-cacheable? {:cache-ttl 100})))

(expect
  false
  (tu/with-temporary-setting-values [enable-query-caching false]
    (#'cache/is-cacheable? {:cache-ttl 100})))

(expect
  false
  (tu/with-temporary-setting-values [enable-query-caching true]
    (#'cache/is-cacheable? {:cache-ttl nil})))

;;; ------------------------------------------ End-to-end middleware tests -------------------------------------------

;; if there's nothing in the cache, cached results should *not* be returned
(expect
  :not-cached
  (tu/with-temporary-setting-values [enable-query-caching  true
                                     query-caching-min-ttl 0]
    (clear-cache!)
    (run-query)))

;; if we run the query twice, the second run should return cached results
(expect
  :cached
  (tu/with-temporary-setting-values [enable-query-caching  true
                                     query-caching-min-ttl 0]
    (clear-cache!)
    (run-query)
    (run-query)))

;; ...but if the cache entry is past it's TTL, the cached results shouldn't be returned
(expect
  :not-cached
  (tu/with-temporary-setting-values [enable-query-caching  true
                                     query-caching-min-ttl 0]
    (clear-cache!)
    (run-query :cache-ttl 1)
    (Thread/sleep 2000)
    (run-query :cache-ttl 1)))

;; if caching is disabled then cache shouldn't be used even if there's something valid in there
(expect
  :not-cached
  (tu/with-temporary-setting-values [enable-query-caching  true
                                     query-caching-min-ttl 0]
    (clear-cache!)
    (run-query)
    (tu/with-temporary-setting-values [enable-query-caching  false
                                       query-caching-min-ttl 0]
      (run-query))))


;; check that `query-caching-max-kb` is respected and queries aren't cached if they're past the threshold
(expect
  :not-cached
  (tu/with-temporary-setting-values [enable-query-caching  true
                                     query-caching-max-kb  0
                                     query-caching-min-ttl 0]
    (clear-cache!)
    (run-query)
    (run-query)))

;; check that `query-caching-max-ttl` is respected. Whenever a new query is cached the cache should evict any entries
;; older that `query-caching-max-ttl`. Set max-ttl to one second, run query `:abc`, then wait two seconds, and run
;; `:def`. This should trigger the cache flush for entries past `:max-ttl`; and the cached entry for `:abc` should be
;; deleted. Running `:abc` a subsequent time should not return cached results
(expect
  :not-cached
  (tu/with-temporary-setting-values [enable-query-caching  true
                                     query-caching-max-ttl 1
                                     query-caching-min-ttl 0]
    (clear-cache!)
    (run-query)
    (Thread/sleep 2000)
    (run-query, :query :def)
    (run-query)))

;; check that *ignore-cached-results* is respected when returning results...
(expect
  :not-cached
  (tu/with-temporary-setting-values [enable-query-caching  true
                                     query-caching-min-ttl 0]
    (clear-cache!)
    (run-query)
    (binding [cache/*ignore-cached-results* true]
      (run-query))))

;; ...but if it's set those results should still be cached for next time.
(expect
  :cached
  (tu/with-temporary-setting-values [enable-query-caching  true
                                     query-caching-min-ttl 0]
    (clear-cache!)
    (binding [cache/*ignore-cached-results* true]
      (run-query))
    (run-query)))

;; if the cache takes less than the min TTL to execute, it shouldn't be cached
(expect
  :not-cached
  (tu/with-temporary-setting-values [enable-query-caching  true
                                     query-caching-min-ttl 60]
    (clear-cache!)
    (run-query)
    (run-query)))

;; ...but if it takes *longer* than the min TTL, it should be cached
(expect
  :cached
  (tu/with-temporary-setting-values [enable-query-caching  true
                                     query-caching-min-ttl 1]
    (binding [*query-execution-delay-ms* 1200]
      (clear-cache!)
      (run-query)
      (run-query))))
