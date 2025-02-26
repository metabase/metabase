(ns metabase.models.legacy-metric-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest update-test
  (testing "Updating"
    (mt/with-temp [:model/LegacyMetric {:keys [id]} {:creator_id (mt/user->id :rasta)
                                                     :table_id   (mt/id :checkins)}]
      (testing "you should not be able to change the creator_id of a Metric"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Metric"
             (t2/update! :model/LegacyMetric id {:creator_id (mt/user->id :crowberto)}))))

      (testing "you shouldn't be able to set it to `nil` either"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Metric"
             (t2/update! :model/LegacyMetric id {:creator_id nil}))))

      (testing "However calling `update!` with a value that is the same as the current value shouldn't throw an Exception"
        (is (= 1
               (t2/update! :model/LegacyMetric id {:creator_id (mt/user->id :rasta)})))))))
