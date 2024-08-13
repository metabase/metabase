(ns metabase.driver.mongo.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.mongo.connection :as mongo.connection]
   [metabase.driver.mongo.util :as mongo.util]
   [metabase.test :as mt]))

(deftest do-find-returns-lazy-seq-test
  (mt/test-driver :mongo
    (testing "do-find returns a lazy seq #42133"
      (mongo.connection/with-mongo-database [db (mt/db)]
        (is (= clojure.lang.LazySeq
               (type (mongo.util/do-find (mongo.util/collection db "venues")))))))))
