(ns metabase.startup.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.startup.core :as startup]))

(deftest fatal-ex-info-test
  (testing "fatal-ex-info marks the exception so run-startup-logic! rethrows instead of logging"
    (let [e (startup/fatal-ex-info "boom" {:x 1})]
      (is (= "boom" (ex-message e)))
      (is (= {:x 1 ::startup/fatal true} (ex-data e))))))
