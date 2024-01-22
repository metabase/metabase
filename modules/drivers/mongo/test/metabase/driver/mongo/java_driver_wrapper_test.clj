(ns metabase.driver.mongo.java-driver-wrapper-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest sanity-test
  (mt/test-driver 
   :mongo
   (mt/dataset
    test-data
    @(def q (mt/db)))))

(comment
  
  
)