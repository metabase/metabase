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
      (doseq [[test-str value-in value-out value-update value-update-out] [["string" "A" "A" "B" "B"]
                                                                           ["key" :A "A" :B "B"]
                                                                           ["vectors"
                                                                            ["A" "B" "C"] ["A" "B" "C"]
                                                                            ["A" "B" "C" "D"] ["A" "B" "C" "D"]]]]
        (testing (format "User Parameter Value for %s values" test-str)
          (testing (format "Upsert creates new user parameter value entry if the param_id user_id pair doesn't exist")
            (upv/upsert! user-id "some-param" value-in)
            (is (= (inc upv-count) (t2/count :model/UserParameterValue)))
            (is (= value-out (:value (t2/select-one :model/UserParameterValue :user_id user-id :parameter_id "some-param")))))

          (testing "Upsert updates user parameter value entry if the param_id user_id pair already exists"
            (upv/upsert! user-id "some-param" value-update)
            (is (= (inc upv-count) (t2/count :model/UserParameterValue)))
            (is (= value-update-out (:value (t2/select-one :model/UserParameterValue :user_id user-id :parameter_id "some-param")))))

          (testing "Upsert deletes user parameter value entry if value is `nil`."
            (upv/upsert! user-id "some-param" nil)
            (is (= upv-count (count (t2/select :model/UserParameterValue))))))))))
