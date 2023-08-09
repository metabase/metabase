(ns metabase.query-processor-test
  "Helper functions for various query processor tests. The tests themselves can be found in various
  `metabase.query-processor-test.*` namespaces; there are so many that it is no longer feasible to keep them all in
  this one. Event-based DBs such as Druid are tested in `metabase.driver.event-query-processor-test`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [schema.core :as s]))

(deftest preprocess-caching-test
  (testing "`preprocess` should work the same even if query has cached results (#18579)"
    ;; make a copy of the `test-data` DB so there will be no cache entries from previous test runs possibly affecting
    ;; this test.
    (mt/with-temp-copy-of-db
      (mt/with-temporary-setting-values [enable-query-caching  true
                                         query-caching-min-ttl 0]
        (let [query            (assoc (mt/mbql-query venues {:order-by [[:asc $id]], :limit 5})
                                      :cache-ttl 10)
              run-query        (fn []
                                 (let [results (qp/process-query query)]
                                   {:cached?  (boolean (:cached results))
                                    :num-rows (count (mt/rows results))}))
              expected-results (qp/preprocess query)]
          (testing "Check preprocess before caching to make sure results make sense"
            (is (schema= {:database (s/eq (mt/id))
                          s/Keyword s/Any}
                         expected-results)))
          (testing "Run the query a few of times so we know it's cached"
            (testing "first run"
              (is (= {:cached?  false
                      :num-rows 5}
                     (run-query))))
            ;; run a few more times to make sure stuff got a chance to be cached.
            (run-query)
            (run-query)
            (testing "should be cached now"
              (is (= {:cached?  true
                      :num-rows 5}
                     (run-query))))
            (testing "preprocess should return same results even when query was cached."
              (is (= expected-results
                     (qp/preprocess query))))))))))
