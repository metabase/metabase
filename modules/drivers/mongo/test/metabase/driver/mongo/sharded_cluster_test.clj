(ns ^:mongo-sharded-cluster-tests metabase.driver.mongo.sharded-cluster-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:synchronized can-connect-test
  (mt/test-driver
   :mongo
   (testing "Mongo driver can connect to a sharded cluster"
     (is (true? (driver/can-connect? :mongo (mt/db)))))))
