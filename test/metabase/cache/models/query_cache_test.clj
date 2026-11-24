(ns metabase.cache.models.query-cache-test
  (:require
   [clojure.test :refer :all]
   [metabase.cache.models.query-cache :as query-cache]
   [metabase.events.test-util :as events.tu]))

(defn- random-hash
  "A random query hash."
  []
  (byte-array (repeatedly 16 (partial rand-int 128))))

(deftest delete-query-caches-statement-count-does-not-grow-with-rows-test
  (let [counted (fn [n]
                  (let [hashes (vec (repeatedly n random-hash))]
                    (events.tu/statement-count! #(query-cache/delete-query-caches! hashes))))]
    (counted 1)
    (is (= (counted 2) (counted 6)))))
