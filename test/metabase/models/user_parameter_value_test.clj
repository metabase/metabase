(ns metabase.models.user-parameter-value-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.user-parameter-value :as upv]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest user-parameter-value-crud-test
  (mt/with-empty-db
    (let [user-id   (mt/user->id :rasta)
          upv-count (t2/count :model/UserParameterValue)]
      (testing "Upsert creates new user parameter value entry if the param_id user_id pair doesn't exist"
        (upv/upsert! user-id "some-param" "A")
        (is (= (inc upv-count) (t2/count :model/UserParameterValue)))
        (is (= "A" (:value (t2/select-one :model/UserParameterValue :user_id user-id :parameter_id "some-param")))))
      (testing "Upsert updates user parameter value entry if the param_id user_id pair already exists"
        (upv/upsert! user-id "some-param" "B")
        (is (= (inc upv-count) (t2/count :model/UserParameterValue)))
        (is (= "B" (:value (t2/select-one :model/UserParameterValue :user_id user-id :parameter_id "some-param")))))
      (testing "Upsert deletes user parameter value entry if value is `nil`."
        (upv/upsert! user-id "some-param" nil)
        (is (= upv-count (count (t2/select :model/UserParameterValue))))))))
