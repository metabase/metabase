(ns metabase.util.events-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.events :as u.events]))

(deftest changed-test
  (let [update-event {:object {:name "b" :description "d" :archived false}
                      :previous-object {:name "a" :description "d" :archived false}}]
    (testing "an update changes the columns whose values differ"
      (is (true? (u.events/changed? update-event :name)))
      (is (false? (u.events/changed? update-event :description)))
      (is (= #{:name} (u.events/changed-keys update-event)))
      (is (true? (u.events/changed-any? update-event #{:name :archived})))
      (is (false? (u.events/changed-any? update-event #{:description :archived}))))
    (testing "a column set to what it was is not changed, as after a batch merges two updates"
      (is (= #{} (u.events/changed-keys {:object {:name "a"} :previous-object {:name "a"}}))))
    (testing "a create changes the columns that have a value"
      (is (= #{:name} (u.events/changed-keys {:object {:name "a" :description nil}})))
      (is (true? (u.events/changed? {:object {:name "a"}} :name)))
      (is (false? (u.events/changed? {:object {:name nil}} :name))))
    (testing "a delete changes the columns that had a value"
      (is (= #{:name} (u.events/changed-keys {:previous-object {:name "a" :description nil}})))
      (is (true? (u.events/changed? {:previous-object {:name "a"}} :name))))))
