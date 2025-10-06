(ns metabase-enterprise.action-v2.actions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.action-v2.actions :as action-v2.actions]))

(def unsupported-dbs-msg #'action-v2.actions/unsupported-dbs-msg)

(deftest unsupported-dbs-msg-test
  (is (= "Data editing isn't supported on the target database." (unsupported-dbs-msg [{:id 1}] [{:id 1}])))
  (is (= "Data editing isn't supported on one of the target databases." (unsupported-dbs-msg [{:id 1} {:id 2}] [{:id 1}])))
  (is (= "Data editing isn't supported on the target databases." (unsupported-dbs-msg [{:id 1} {:id 2}] [{:id 1} {:id 2}])))
  (is (= "Data editing isn't supported on some of the target databases." (unsupported-dbs-msg [{:id 1} {:id 2} {:id 3}] [{:id 1} {:id 2}]))))
