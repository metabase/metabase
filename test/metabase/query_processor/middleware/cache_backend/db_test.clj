(ns metabase.query-processor.middleware.cache-backend.db-test
  (:require [expectations :refer :all]
            [metabase.query-processor.middleware.cache-backend.db :as cache-db]
            [metabase.test.util :as tu]))

(defn- in-kb [x]
  (* 1024 x))

(expect
  (tu/with-temporary-setting-values [query-caching-max-kb 128]
    (#'cache-db/results-below-max-threshold? (byte-array (in-kb 100)))))

(expect
  false
  (tu/with-temporary-setting-values [query-caching-max-kb 1]
    (#'cache-db/results-below-max-threshold? (byte-array (in-kb 2)))))
