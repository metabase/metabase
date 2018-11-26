(ns metabase.query-processor.middleware.cache-backend.db-test
  (:require [expectations :refer :all]
            [metabase.query-processor.middleware.cache-backend.db :as cache-db]
            [metabase.test.util :as tu]))

(defn- in-kb [x]
  (* 1024 x))

;; We should successfully compress data smaller than the max and return the byte array
(expect
  (bytes? (#'cache-db/compress-until-max (in-kb 10) (range 1 10))))

;; If the data is more than the max allowed, return `:exceeded-max-bytes`
(expect
  ::cache-db/exceeded-max-bytes
  (#'cache-db/compress-until-max 10 (repeat 10000 (range 1 10))))
