(ns metabase.models.user-parameter-value-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.user-parameter-value :as upv]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest user-parameter-value-crud-test
  (mt/initialize-if-needed! :db)
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-model-cleanup [:model/UserParameterValue]
      (let [upv-count (t2/count :model/UserParameterValue)]
        (testing "Upsert creates new user parameter value entry if the param_id user_id pair doesn't exist"
          (upv/upsert! (mt/user->id :rasta) "some-param" "A")
          (is (= (inc upv-count) (t2/count :model/UserParameterValue)))
          (is (= "A" (:value (t2/select-one :model/UserParameterValue :user_id 1 :parameter_id "some-param")))))
        (testing "Upsert updates user parameter value entry if the param_id user_id pair already exists"
          (upv/upsert! (mt/user->id :rasta) "some-param" "B")
          (is (= (inc upv-count) (t2/count :model/UserParameterValue)))
          (is (= "B" (:value (t2/select-one :model/UserParameterValue :user_id 1 :parameter_id "some-param")))))
        (testing "Upsert deletes user parameter value entry if value is `nil`."
          (upv/upsert! (mt/user->id :rasta) "some-param" nil)
          (is (= upv-count (t2/count :model/UserParameterValue))))))))

#_(deftest user-parameter-value-hydration-test
  (testing "Dashboards are hydrated with a :user-parameter-values map."
    (mt/with-temp [:model/Dashboard dash {:name "test"}]
      )))
