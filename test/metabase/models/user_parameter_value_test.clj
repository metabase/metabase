(ns metabase.models.user-parameter-value-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.user-parameter-value :as upv]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest user-parameter-value-crud-test
  (mt/with-empty-db
    (testing "Upsert creates new user parameter value entry if the param_id user_id pair doesn't exist"
      (upv/upsert! (mt/user->id :rasta) "some-param" "A")
      (is (= 1 (t2/count :model/UserParameterValue)))
      (is (= "A" (:value (t2/select-one :model/UserParameterValue :user_id 1 :parameter_id "some-param")))))
    (testing "Upsert updates user parameter value entry if the param_id user_id pair already exists"
      (upv/upsert! (mt/user->id :rasta) "some-param" "B")
      (is (= 1 (t2/count :model/UserParameterValue)))
      (is (= "B" (:value (t2/select-one :model/UserParameterValue :user_id 1 :parameter_id "some-param")))))
    (testing "Upsert deletes user parameter value entry if value is `nil`."
      (upv/upsert! (mt/user->id :rasta) "some-param" nil)
      (is (= 0 (count (t2/select :model/UserParameterValue)))))))
