(ns metabase.driver.metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.metadata :as driver.metadata]))

(deftest ^:parallel legacy-metadata?-test
  (is (not (driver.metadata/legacy-metadata?
            {:classname   "org.h2.Driver"
             :subprotocol "h2"
             :subname     "mem:test-data;USER=GUEST;PASSWORD=guest"}))))
